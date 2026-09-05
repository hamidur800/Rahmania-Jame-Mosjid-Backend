const verifyAdmin = (usersCollection) => {
  return async (req, res, next) => {
    try {
      const email = req.user?.email;

      if (!email) {
        return res.status(401).send({
          message: "User email not found",
        });
      }

      const user = await usersCollection.findOne({
        email: email,
      });

      if (!user) {
        return res.status(404).send({
          message: "User not found",
        });
      }

      if (user.role !== "admin") {
        return res.status(403).send({
          message: "Forbidden access. Admin only.",
        });
      }

      req.adminUser = user;

      next();
    } catch (error) {
      console.error("Admin Verification Error:", error);

      return res.status(500).send({
        message: "Internal server error",
      });
    }
  };
};

export default verifyAdmin;
