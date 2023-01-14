import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";

dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;
await connectToDataBase();
setInterval(checkActiveUsers, 15000);

checkActiveUsers();

const server = express();

server.use(cors());
server.use(express.json());

server.post("/status", async (req, res) => {
	const { user: userName } = req.headers;

	try {
		const user = await db
			.collection("participants")
			.findOne({ name: userName });

		if (!user) return res.sendStatus(404);

		await db
			.collection("participants")
			.updateOne(
				{ _id: ObjectId(user._id) },
				{ $set: { lastStatus: Date.now() } }
			);

		return res.sendStatus(200);
	} catch (error) {
		console.log(error.message);
		return res.sendStatus(500);
	}
});

server.post("/participants", async (req, res) => {
	const participant = req.body;

	const schema = Joi.object({
		name: Joi.string().min(1).required(),
	});

	const validation = schema.validate(participant, { abortEarly: false });

	if (validation.error) {
		const errors = validation.error.details.map((detail) => detail.message);
		return res.status(422).send(errors);
	}

	try {
		const { name } = participant;

		const doesUserExist = await db
			.collection("participants")
			.findOne({ name });

		if (doesUserExist) return res.sendStatus(422);

		await db.collection("participants").insertOne({
			name,
			lastStatus: Date.now(),
		});

		await db.collection("messages").insertOne({
			from: name,
			to: "Todos",
			text: "entra na sala...",
			type: "status",
			time: getNowTime(),
		});

		return res.sendStatus(201);
	} catch (error) {
		return res.sendStatus(500).send(error);
	}
});

server.get("/participants", async (req, res) => {
	try {
		const participants = await db
			.collection("participants")
			.find()
			.toArray();
		return res.status(200).send(participants);
	} catch (error) {
		return res.status(500).send(error);
	}
});

server.post("/messages", async (req, res) => {
	const messageData = req.body;
	const { user: from } = req.headers;

	const schema = Joi.object({
		to: Joi.string().min(1).required(),
		text: Joi.string().min(1).required(),
		type: Joi.string().valid("message", " private_message").required(),
	});

	const validation = schema.validate(messageData, { abortEarly: false });

	if (validation.error) {
		const errors = validation.error.details.map((detail) => detail.message);
		return res.status(422).send(errors);
	}

	try {
		const { to, text, type } = messageData;
		await db
			.collection("messages")
			.insertOne({ from, to, text, type, time: getNowTime() });
		return res.sendStatus(201);
	} catch (error) {
		return res.status(500).send(error.message);
	}
});

server.get("/messages", async (req, res) => {
	const { user } = req.headers;
	const { limit } = req.query;

	try {
		const messages = await db.collection("messages").find().toArray();

		let filteredMessages = messages.filter(
			(message) =>
				message.to === user ||
				message.to === "Todos" ||
				message.from === user
		);
		if (limit) filteredMessages = filteredMessages.slice(-parseInt(limit));
		return res.status(200).send(filteredMessages);
	} catch (error) {
		return res.status(500).send(error);
	}
});

server.delete("/messages/:id", async (req, res) => {
	const { id } = req.params;
	const { user } = req.headers;

	try {
		const foundMessage = await db
			.collection("messages")
			.findOne({ _id: ObjectId(id) });

		if (!foundMessage) return res.sendStatus(404);

		if (foundMessage.from !== user) return res.sendStatus(401);

		await db.collection("messages").deleteOne({ _id: ObjectId(id) });
	} catch (error) {
		console.log(error);
		return res.sendStatus(500);
	}
});

server.put("/messages/:id", async (req, res) => {
	const { text } = req.body;
	const { id } = req.params;
	const { user } = req.headers;

	try {
		const foundMessage = await db
			.collection("messages")
			.findOne({ _id: ObjectId(id) });

		if (!foundMessage) return res.sendStatus(404);

		if (foundMessage.from !== user) return res.sendStatus(401);

		await db
			.collection("messages")
			.updateOne({ _id: ObjectId(id) }, { $set: { text } });
	} catch (error) {
		console.log(error);
		return res.sendStatus(500);
	}
});

server.listen(5000, function () {
	console.log(getTime(Date.now()) + " - server is running...");
});

async function checkActiveUsers() {
	try {
		const participants = await db
			.collection("participants")
			.find()
			.toArray();

		participants.map(async (participant) => {
			const lastActiveTime = (Date.now() - participant.lastStatus) / 1000;

			if (lastActiveTime > 15) {
				await db.collection("messages").insertOne({
					from: participant.name,
					to: "Todos",
					text: "sai da sala...",
					type: "status",
					time: Date.now(),
				});
				await db
					.collection("participants")
					.deleteOne({ _id: ObjectId(participant._id) });
				console.log(participant.name, "deleted for inactivity");
			}
		});
	} catch (error) {
		console.log(error.message);
	}
}

async function connectToDataBase() {
	try {
		mongoClient.connect();
		db = await mongoClient.db("bate-papo-uol");
		console.log("connected to mongo db");
	} catch (error) {
		console.log("error while trying to connect to database");
	}
}

function getTime(date) {
	const d = new Date(date);
	const hh = d.getHours();
	const min = d.getMinutes();
	const ss = d.getSeconds();
	let mm = d.getMonth() + 1; // Months start at 0!
	let dd = d.getDate();

	if (dd < 10) dd = "0" + dd;
	if (mm < 10) mm = "0" + mm;

	return dd + "/" + mm + "\\ " + hh + ":" + min + ":" + ss + " ";
}

function getNowTime() {
	return dayjs().format("HH:mm:ss");
}

// --- LIST OF STATUS CODES
// 200: Ok => Significa que deu tudo certo com a requisição
// 201: Created => Sucesso na criação do recurso
// 301: Moved Permanently => Significa que o recurso que você está tentando acessar foi movido pra outra URL
// 401: Unauthorized => Significa que você não tem acesso a esse recurso
// 404: Not Found => Significa que o recurso pedido não existe
// 409: Conflict => Significa que o recurso que você está tentando inserir já foi inserido
// 422: Unprocessable Entity => Significa que a requisição enviada não está no formato esperado
// 500: Internal Server Error => Significa que ocorreu algum erro desconhecido no servidor
