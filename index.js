import "dotenv/config";
import admin from "firebase-admin";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

import verifyToken from "./middleware/verifyToken.js";
import verifyAdmin from "./middleware/verifyAdmin.js";

const app = express();

const port = process.env.PORT || 5000;

// ========================================
// FIREBASE ADMIN
// ========================================

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

console.log("Firebase Admin initialized successfully");

// ========================================
// MIDDLEWARE
// ========================================

app.use(express.json());

app.use(cookieParser());

const allowedOrigins = [
  "http://localhost:5173",
  "https://rahmania-jame-mosjid.netlify.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// ========================================
// MONGODB
// ========================================

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ========================================
// MAIN SERVER
// ========================================

async function run() {
  try {
    await client.connect();

    const db = client.db("rjm_backend-DB");

    const usersCollection = db.collection("users");
    const prayerCollection = db.collection("prayerTimes");
    const donationsCollection = db.collection("donations");
    const settingsCollection = db.collection("settings");

    console.log("MongoDB Connected Successfully");

    // ========================================
    // HOME ROUTE
    // ========================================

    app.get("/", (req, res) => {
      res.send("Rahmania Jame Mosjid Server Running...");
    });

    app.patch("/users/fcm-token", verifyToken, async (req, res) => {
      try {
        const { email, fcmToken } = req.body;

        if (!email || !fcmToken) {
          return res.status(400).send({
            message: "Email and FCM token are required",
          });
        }

        if (req.user.email !== email) {
          return res.status(403).send({
            message: "Forbidden access",
          });
        }

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              fcmToken,
              updatedAt: new Date(),
            },
          },
        );

        res.send({
          success: true,
          message: "FCM token saved successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("SAVE FCM TOKEN ERROR:", error);

        res.status(500).send({
          message: "Failed to save FCM token",
        });
      }
    });

    // ========================================
    // JWT ROUTE
    // ========================================

    app.post("/jwt", async (req, res) => {
      try {
        const user = req.body;

        if (!user?.email) {
          return res.status(400).send({
            message: "Email is required",
          });
        }

        const token = jwt.sign(
          {
            email: user.email,
          },
          process.env.JWT_SECRET,
          {
            expiresIn: "7d",
          },
        );

        res.send({
          token,
        });
      } catch (error) {
        console.error("JWT Error:", error);

        res.status(500).send({
          message: "Failed to generate token",
        });
      }
    });
    // ========================================
    // USERS
    // ========================================
    // ==========================================
    // GET USER SETTINGS
    // ==========================================
    app.get("/settings/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        const settings = await settingsCollection.findOne({
          email: email,
        });

        // Settings না থাকলে default settings পাঠাবে
        if (!settings) {
          return res.status(200).send({
            email: email,
            notifications: true,
            prayerReminder: true,
            darkMode: false,
            language: "English",
          });
        }

        res.status(200).send(settings);
      } catch (error) {
        console.error("GET SETTINGS ERROR:", error);

        res.status(500).send({
          message: "Failed to get settings",
        });
      }
    });

    // ==========================================
    // SAVE / UPDATE USER SETTINGS
    // ==========================================
    app.put("/settings/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        const { notifications, prayerReminder, darkMode, language } = req.body;

        const filter = {
          email: email,
        };

        const updateDoc = {
          $set: {
            email: email,
            notifications: notifications,
            prayerReminder: prayerReminder,
            darkMode: darkMode,
            language: language,
            updatedAt: new Date(),
          },

          $setOnInsert: {
            createdAt: new Date(),
          },
        };

        const options = {
          upsert: true,
        };

        const result = await settingsCollection.updateOne(
          filter,
          updateDoc,
          options,
        );

        res.status(200).send({
          success: true,
          message: "Settings saved successfully",
          result,
        });
      } catch (error) {
        console.error("SAVE SETTINGS ERROR:", error);

        res.status(500).send({
          message: "Failed to save settings",
        });
      }
    });
    // ========================================
    // MAKE ADMIN
    // ========================================

    app.patch(
      "/users/make-admin/:id",
      verifyToken,
      verifyAdmin(usersCollection),
      async (req, res) => {
        try {
          const id = req.params.id;

          const result = await usersCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                role: "admin",
              },
            },
          );

          res.send(result);
        } catch (error) {
          console.error("Make Admin Error:", error);

          res.status(500).send({
            message: "Failed to make admin",
          });
        }
      },
    );

    // ========================================
    // REMOVE ADMIN
    // ========================================

    app.patch(
      "/users/remove-admin/:id",
      verifyToken,
      verifyAdmin(usersCollection),
      async (req, res) => {
        try {
          const id = req.params.id;

          const result = await usersCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                role: "user",
              },
            },
          );

          res.send(result);
        } catch (error) {
          console.error("Remove Admin Error:", error);

          res.status(500).send({
            message: "Failed to remove admin",
          });
        }
      },
    );

    // ========================================
    // GET CURRENT USER
    // ========================================

    app.get("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // ==========================================
        // CHECK CURRENT LOGGED-IN USER
        // ==========================================

        const currentUser = await usersCollection.findOne({
          email: req.user.email,
        });

        if (!currentUser) {
          return res.status(404).send({
            message: "Current user not found",
          });
        }

        // ==========================================
        // USER CAN SEE ONLY OWN PROFILE
        // ADMIN CAN SEE ANY USER PROFILE
        // ==========================================

        if (req.user.email !== email && currentUser.role !== "admin") {
          return res.status(403).send({
            message: "Forbidden access",
          });
        }

        // ==========================================
        // GET TARGET USER
        // ==========================================

        const user = await usersCollection.findOne({
          email: email,
        });

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send(user);
      } catch (error) {
        console.error("Get User Error:", error);

        res.status(500).send({
          message: "Failed to get user",
        });
      }
    });

    // =========================================================
    // CHECK USER EXISTS BY EMAIL
    // =========================================================
    app.get("/users/check/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // Firebase authenticated user এবং requested email match করতে হবে
        if (req.user.email !== email) {
          return res.status(403).send({
            message: "Forbidden access",
          });
        }

        const user = await usersCollection.findOne({
          email: email,
        });

        if (!user) {
          return res.status(404).send({
            exists: false,
            message: "User not found",
          });
        }

        res.send({
          exists: true,
          user,
        });
      } catch (error) {
        console.error("CHECK USER ERROR:", error);

        res.status(500).send({
          message: "Failed to check user",
        });
      }
    });

    // =========================================================
    // CREATE USER
    // =========================================================
    app.post("/users", verifyToken, async (req, res) => {
      try {
        const user = req.body;

        // ==========================================
        // EMAIL REQUIRED
        // ==========================================
        if (!user?.email) {
          return res.status(400).send({
            message: "Email is required",
          });
        }

        // ==========================================
        // FIREBASE EMAIL & BODY EMAIL MUST MATCH
        // ==========================================
        if (req.user.email !== user.email) {
          return res.status(403).send({
            message: "Email does not match authenticated user",
          });
        }

        // ==========================================
        // NAME REQUIRED
        // ==========================================
        if (!user?.name || !user.name.trim()) {
          return res.status(400).send({
            message: "Name is required",
          });
        }

        // ==========================================
        // PHONE REQUIRED
        // ==========================================
        if (!user?.phone || !user.phone.trim()) {
          return res.status(400).send({
            message: "Phone number is required",
          });
        }

        // ==========================================
        // CLEAN PHONE
        // ==========================================
        const phone = user.phone.replace(/\s+/g, "");

        // ==========================================
        // BANGLADESH PHONE VALIDATION
        // ==========================================
        const phoneRegex = /^(01[3-9]\d{8}|\+8801[3-9]\d{8})$/;

        if (!phoneRegex.test(phone)) {
          return res.status(400).send({
            message: "Invalid Bangladesh phone number. Example: 01712345678",
          });
        }

        // ==========================================
        // CHECK EXISTING USER
        // ==========================================
        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.status(409).send({
            message: "User already exists",
            insertedId: null,
          });
        }

        // ==========================================
        // FINAL USER DATA
        // ==========================================
        const newUser = {
          name: user.name.trim(),
          email: user.email,
          phone,
          photoURL: user.photoURL || "",
          role: "user",
          status: "Active",
          monthlyFee: Number(user.monthlyFee) || 100,
          authProvider: user.authProvider || "password",
          createdAt: new Date(),
        };

        // ==========================================
        // INSERT
        // ==========================================
        const result = await usersCollection.insertOne(newUser);

        console.log("New user created:", {
          email: newUser.email,
          phone: newUser.phone,
          authProvider: newUser.authProvider,
        });

        res.status(201).send({
          success: true,
          message: "User created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("POST USER ERROR:", error);

        res.status(500).send({
          message: "Failed to create user",
        });
      }
    });

    // ========================================
    // GET ALL USERS - ADMIN ONLY
    // ========================================

    app.get(
      "/users",
      verifyToken,
      verifyAdmin(usersCollection),
      async (req, res) => {
        try {
          const result = await usersCollection.find().toArray();

          res.send(result);
        } catch (error) {
          console.error("GET USERS ERROR:", error);

          res.status(500).send({
            message: "Failed to get users",
          });
        }
      },
    );

    // ========================================
    // UPDATE OWN PROFILE
    // ========================================

    app.patch("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // User নিজের profile-ই update করতে পারবে
        if (req.user.email !== email) {
          return res.status(403).send({
            message: "Forbidden access",
          });
        }

        const updatedData = req.body;

        const updateFields = {};

        if (updatedData.name !== undefined) {
          updateFields.name = updatedData.name;
        }

        if (updatedData.photoURL !== undefined) {
          updateFields.photoURL = updatedData.photoURL;
        }

        if (updatedData.phone !== undefined) {
          updateFields.phone = updatedData.phone;
        }

        const result = await usersCollection.updateOne(
          {
            email: email,
          },
          {
            $set: updateFields,
          },
        );

        res.send(result);
      } catch (error) {
        console.error("UPDATE PROFILE ERROR:", error);

        res.status(500).send({
          message: "Failed to update profile",
          error: error.message,
        });
      }
    });
    // ========================================
    //  USERS PAYMENT HISTORY
    // ========================================

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();

      res.send(users);
    });

    app.get("/users/:email/payment-history", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // Current logged-in user check
        const currentUser = await usersCollection.findOne({
          email: req.user.email,
        });

        if (!currentUser) {
          return res.status(404).send({
            message: "Current user not found",
          });
        }

        // শুধুমাত্র admin অন্য user-এর payment history দেখতে পারবে
        if (currentUser.role !== "admin") {
          return res.status(403).send({
            message: "Only admin can view payment history",
          });
        }

        const payments = await donationsCollection
          .find({
            email: email,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send(payments);
      } catch (error) {
        console.error("Payment History Error:", error);

        res.status(500).send({
          message: "Failed to get payment history",
        });
      }
    });

    // ========================================
    // PRAYER TIMES
    // ========================================

    // GET PRAYER TIMES
    app.get("/prayer-times", async (req, res) => {
      try {
        const prayerTimes = await prayerCollection.findOne({
          type: "daily",
        });

        res.send(prayerTimes);
      } catch (error) {
        console.error("GET PRAYER TIMES ERROR:", error);

        res.status(500).send({
          message: "Failed to get prayer times",
        });
      }
    });

    // ========================================
    // UPDATE PRAYER TIMES
    // ADMIN ONLY
    // ========================================

    app.put(
      "/prayer-times",
      verifyToken,
      verifyAdmin(usersCollection),
      async (req, res) => {
        try {
          const updatedPrayerTimes = req.body;

          // ==========================================
          // 1. Update Prayer Times
          // ==========================================
          const result = await prayerCollection.updateOne(
            {
              type: "daily",
            },
            {
              $set: {
                ...updatedPrayerTimes,
                type: "daily",
                updatedAt: new Date(),
              },
            },
            {
              upsert: true,
            },
          );

          // ==========================================
          // 2. Get All Users Who Have FCM Token
          // ==========================================
          const users = await usersCollection
            .find({
              fcmToken: {
                $exists: true,
                $ne: "",
              },
            })
            .project({
              email: 1,
              fcmToken: 1,
            })
            .toArray();

          const tokens = users.map((user) => user.fcmToken).filter(Boolean);

          // ==========================================
          // 3. Send Notification
          // ==========================================
          let notificationResult = {
            successCount: 0,
            failureCount: 0,
          };

          if (tokens.length > 0) {
            try {
              const response = await getMessaging().sendEachForMulticast({
                tokens,

                notification: {
                  title: "নামাজের সময় আপডেট",
                  body: "রহমানিয়া জামে মসজিদের নামাজের সময়সূচি আপডেট করা হয়েছে।",
                },

                data: {
                  type: "prayer-time-update",
                  message: "Prayer times have been updated",
                },

                webpush: {
                  notification: {
                    title: "নামাজের সময় আপডেট",
                    body: "রহমানিয়া জামে মসজিদের নামাজের সময়সূচি আপডেট করা হয়েছে।",
                    icon: "https://rahmania-jame-mosjid.netlify.app/logo.jpg",
                    badge: "https://rahmania-jame-mosjid.netlify.app/logo.jpg",
                  },
                },
              });

              notificationResult = {
                successCount: response.successCount,
                failureCount: response.failureCount,
              };

              console.log(
                `Prayer notification sent: ${response.successCount} successful, ${response.failureCount} failed`,
              );
            } catch (notificationError) {
              console.error("PRAYER NOTIFICATION ERROR:", notificationError);
            }
          } else {
            console.log("No FCM tokens found.");
          }

          // ==========================================
          // 4. Send Response
          // ==========================================
          res.send({
            success: true,
            message: "Prayer times updated successfully",

            result,

            notification: {
              totalTokens: tokens.length,
              successCount: notificationResult.successCount,
              failureCount: notificationResult.failureCount,
            },
          });
        } catch (error) {
          console.error("UPDATE PRAYER TIMES ERROR:", error);

          res.status(500).send({
            success: false,
            message: "Failed to update prayer times",
          });
        }
      },
    );

    // ========================================
    // DONATIONS
    // ========================================

    // POST DONATION
    // ========================================
    // CREATE DONATION
    // USER + ADMIN
    // ========================================

    app.post("/donations", verifyToken, async (req, res) => {
      try {
        const donation = req.body;

        // ========================================
        // AUTHENTICATED USER
        // ========================================

        const authenticatedEmail = req.user?.email;

        if (!authenticatedEmail) {
          return res.status(401).send({
            success: false,
            message: "Authenticated user email not found",
          });
        }

        // ========================================
        // FIND AUTHENTICATED USER
        // ========================================

        const authenticatedUser = await usersCollection.findOne({
          email: authenticatedEmail,
        });

        if (!authenticatedUser) {
          return res.status(404).send({
            success: false,
            message: "Authenticated user not found",
          });
        }

        // ========================================
        // CHECK ADMIN
        // ========================================

        const isAdmin = authenticatedUser.role === "admin";

        // ========================================
        // TARGET USER EMAIL
        // ========================================

        const targetEmail =
          donation.userEmail ||
          donation.donorEmail ||
          donation.email ||
          authenticatedEmail;

        // ========================================
        // NORMAL USER
        // ========================================

        if (!isAdmin) {
          // Normal user অন্য user-এর নামে donation
          // create করতে পারবে না

          if (targetEmail !== authenticatedEmail) {
            return res.status(403).send({
              success: false,
              message: "You can only create donation for your own account",
            });
          }
        }

        // ========================================
        // TARGET USER
        // ========================================

        let targetUser = authenticatedUser;

        if (isAdmin) {
          targetUser = await usersCollection.findOne({
            email: targetEmail,
          });

          if (!targetUser) {
            return res.status(404).send({
              success: false,
              message: "Selected user not found",
            });
          }
        }

        // ========================================
        // DONATION ID
        // ========================================

        const targetUserId =
          donation.userId || targetUser?._id?.toString() || "";

        // ========================================
        // DONATION DATA
        // ========================================

        const donationToSave = {
          ...donation,

          // ======================================
          // MOST IMPORTANT
          // Selected user's email
          // ======================================

          userEmail: targetEmail,

          email: targetEmail,

          donorEmail: targetEmail,

          // ======================================
          // USER INFORMATION
          // ======================================

          userId: targetUserId,

          name:
            donation.name ||
            donation.donorName ||
            targetUser?.name ||
            "Unknown User",

          donorName:
            donation.donorName ||
            donation.name ||
            targetUser?.name ||
            "Unknown User",

          donorPhone: donation.donorPhone || targetUser?.phone || "",

          // ======================================
          // STATUS
          // ======================================

          status: isAdmin ? "Approved" : donation.status || "Pending",

          // ======================================
          // CREATED DATE
          // ======================================

          createdAt: new Date(),
        };

        console.log("FINAL DONATION TO SAVE:", donationToSave);

        // ========================================
        // SAVE
        // ========================================

        const result = await donationsCollection.insertOne(donationToSave);

        // ========================================
        // RESPONSE
        // ========================================

        res.status(201).send({
          success: true,

          message: isAdmin
            ? "Donation created successfully for selected user"
            : "Donation submitted successfully",

          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Donation POST Error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create donation",
        });
      }
    });

    // ========================================
    // GET MY DONATIONS
    // ========================================

    app.get("/donations/:email", verifyToken, async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        // ========================================
        // SECURITY
        // User শুধু নিজের history দেখতে পারবে
        // ========================================

        if (req.user.email !== email) {
          return res.status(403).send({
            success: false,
            message: "Forbidden access",
          });
        }

        // ========================================
        // FIND DONATIONS
        // ========================================

        const donations = await donationsCollection
          .find({
            userEmail: email,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        console.log(`Donation history for ${email}:`, donations.length);

        // ========================================
        // RESPONSE
        // ========================================

        res.send(donations);
      } catch (error) {
        console.error("Get Donations Error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get donation history",
        });
      }
    });

    // ========================================
    // GET ALL DONATIONS
    // ADMIN ONLY
    // ========================================

    app.get(
      "/donations",
      verifyToken,
      verifyAdmin(usersCollection),
      async (req, res) => {
        try {
          const donations = await donationsCollection
            .find()
            .sort({
              createdAt: -1,
            })
            .toArray();

          res.status(200).send(donations);
        } catch (error) {
          console.error("Failed to get donations:", error);

          res.status(500).send({
            message: "Failed to load donations",
          });
        }
      },
    );

    // ========================================
    // UPDATE DONATION STATUS
    // ADMIN ONLY
    // ========================================

    app.patch(
      "/donations/:id",
      verifyToken,
      verifyAdmin(usersCollection),
      async (req, res) => {
        try {
          const { id } = req.params;

          const { status } = req.body;

          const allowedStatuses = ["Pending", "Paid", "Defaulted"];

          if (!allowedStatuses.includes(status)) {
            return res.status(400).send({
              message: "Invalid payment status",
            });
          }

          const result = await donationsCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: {
                status: status,
              },
            },
          );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              message: "Donation not found",
            });
          }

          res.send({
            success: true,
            message: "Payment status updated successfully",
          });
        } catch (error) {
          console.error("Status update error:", error);

          res.status(500).send({
            success: false,
            message: "Failed to update payment status",
          });
        }
      },
    );

    // ========================================
    // DONATION RECEIPT
    // ========================================

    app.get("/donations/receipt/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        const donation = await donationsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!donation) {
          return res.status(404).send({
            message: "Donation receipt not found",
          });
        }

        // Receipt owner অথবা admin access
        const isOwner = donation.userEmail === req.user.email;

        if (!isOwner) {
          const adminUser = await usersCollection.findOne({
            email: req.user.email,
          });

          if (adminUser?.role !== "admin") {
            return res.status(403).send({
              message: "Forbidden access",
            });
          }
        }

        res.send(donation);
      } catch (error) {
        console.error("Receipt Error:", error);

        res.status(500).send({
          message: "Failed to load donation receipt",
        });
      }
    });

    // ========================================
    // SERVER STATUS
    // ========================================

    console.log("All routes registered successfully");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

run().catch(console.dir);

// ========================================
// START SERVER
// ========================================

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
