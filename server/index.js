require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const connection = require("./db");

const passwordResetRoutes = require("./routes/passwordReset");

// database connection
connection();

// middlewares  and using json format
app.use(express.json());
app.use(cors());

// routes
app.use("/api/password-reset", passwordResetRoutes);

//procee running in either  8080 port or any other port
const port = process.env.PORT || 8080;
app.listen(port, console.log(`Listening on port ${port}...`));