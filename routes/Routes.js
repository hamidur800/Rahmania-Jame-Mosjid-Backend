const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {
  res.send([
    {
      id: 1,
      name: "iPhone 12",
      price: 50000,
    },
    {
      id: 2,
      name: "Samsung S24",
      price: 80000,
    },
  ]);
});

router.get("/:id", (req, res) => {
  const id = req.params.id;

  res.send({
    message: "Product found",
    productId: id,
  });
});

module.exports = router;
