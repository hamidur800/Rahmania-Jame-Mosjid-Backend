import { getAuth } from "firebase-admin/auth";
import "../firebaseAdmin.js";

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("Authorization Header:", authHeader ? "Received" : "Missing");

    if (!authHeader) {
      return res.status(401).send({
        message: "Authorization token missing",
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Invalid authorization format",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return res.status(401).send({
        message: "Token missing",
      });
    }

    const decodedToken = await getAuth().verifyIdToken(token);

    console.log("Firebase user verified:", decodedToken.email);

    req.user = decodedToken;

    next();
  } catch (error) {
    console.error("🔥 Firebase Token Error:");
    console.error(error.code);
    console.error(error.message);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};

export default verifyToken;
