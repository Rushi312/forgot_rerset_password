const router = require("express").Router();
const { User } = require("../models/user");
const Token = require("../models/token");
const crypto = require("crypto");
const sendEmail = require("../utils/sendEmail");
const Joi = require("joi");
const passwordComplexity = require("joi-password-complexity");
const bcrypt = require("bcrypt");
const amqp = require("amqplib/callback_api");


// send password link
router.post("/", async (req, res) => {
	try {
		const emailSchema = Joi.object({
			email: Joi.string().email().required().label("Email"),
		});
		console.log(req.body);
		const { error } = emailSchema.validate(req.body);
		if (error)
			return res.status(400).send({ message: error.details[0].message });

			//check the email which are writting in the website that email exist , if not exist then return error

		let user = await User.findOne({ email: req.body.email });
		console.log("user >> ", user);
		if (!user)
			return res
				.status(409)
				.send({ message: "User with given email does not exist!" });

		//check the token in database if tokeen is not exist then create a new token

		let token = await Token.findOne({ userId: user._id });
		if (!token) {
			token = await new Token({
				userId: user._id,
				token: crypto.randomBytes(32).toString("hex"),
			}).save();
		}

		const url = `${process.env.BASE_URL}password-reset/${user._id}/${token.token}/`;
	//message que
		// connect to amqp cloud
		amqp.connect(process.env.RABBITMQ_URI, (err, connection) => {
			if(err)
				throw err;

			// provider side chsnnel
			connection.createChannel((err1, channel)=> {
				if(err1)
					throw err1;
				//create queue and assert the queue
				channel.assertQueue("email", {durable : true});
				//sent the mail which is to the queue
				channel.sendToQueue("email", Buffer.from(JSON.stringify({"email" : user.email, url })));
			});

			// consumer sidec hannel
			connection.createChannel((err1, channel)=> {
				if(err1)
					throw err1;
				// if queue is already present then use it
				// or create a new queue
				channel.assertQueue("email", {durable : true});
				channel.consume("email", (msg) => {
					const parsed = JSON.parse(msg.content.toString());
					// console.log("Parsed data  = ", parsed);
		 			sendEmail(parsed.email, "Password Reset", parsed.url);
				});
			}, {noAck: true});
			
		})

		res
			.status(200)
			.send({ message: "Password reset link sent to your email account" });
	} catch (error) {
		console.log(error);
		res.status(500).send({ message: "Internal Server Error" });
	}
});

// verify password reset link in send in email
router.get("/:id/:token", async (req, res) => {
	try {
		const user = await User.findOne({ _id: req.params.id });
		if (!user) return res.status(400).send({ message: "Invalid link" });

		const token = await Token.findOne({
			userId: user._id,
			token: req.params.token,
		});
		if (!token) return res.status(400).send({ message: "Invalid link" });

		res.status(200).send("Valid Url");
	} catch (error) {
		res.status(500).send({ message: "Internal Server Error" });
	}
});

//  set new password
router.post("/:id/:token", async (req, res) => {
	try {
		const passwordSchema = Joi.object({
			password: passwordComplexity().required().label("Password"),
		});
		const { error } = passwordSchema.validate(req.body);
		if (error)
			return res.status(400).send({ message: error.details[0].message });

		const user = await User.findOne({ _id: req.params.id });
		if (!user) return res.status(400).send({ message: "Invalid link" });

		const token = await Token.findOne({
			userId: user._id,
			token: req.params.token,
		});
		if (!token) return res.status(400).send({ message: "Invalid link" });

		if (!user.verified) user.verified = true;

		const salt = await bcrypt.genSalt(Number(process.env.SALT));
		const hashPassword = await bcrypt.hash(req.body.password, salt);

		user.password = hashPassword;
		await user.save();
		await token.remove();

		res.status(200).send({ message: "Password reset successfully" });
	} catch (error) {
		res.status(500).send({ message: "Internal Server Error" });
	}
});

module.exports = router;
