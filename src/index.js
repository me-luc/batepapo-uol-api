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
	const { user } = req.headers;

	if (!user) return res.sendStatus(422);

	try {
		const foundUser = await db
			.collection("participants")
			.findOne({ name: user });

		if (!foundUser) return res.sendStatus(404);

		await db
			.collection("participants")
			.updateOne(
				{ _id: ObjectId(foundUser._id) },
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

		if (doesUserExist) return res.sendStatus(409);

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
	const { user } = req.headers;

	const schema = Joi.object({
		to: Joi.string().min(1).required(),
		text: Joi.string().min(1).required(),
		type: Joi.string().valid("message", "private_message").required(),
	});

	if (!user)
		return res.status(422).send("Cabe??alho deve ter formato v??lido!");

	const validation = schema.validate(messageData, { abortEarly: false });

	if (validation.error) {
		const errors = validation.error.details.map((detail) => detail.message);
		return res.status(422).send(errors);
	}

	try {
		const foundUser = await db
			.collection("participants")
			.findOne({ name: user });

		if (!foundUser)
			return res
				.status(422)
				.send("Usu??rio n??o foi encontrado na lista de ativos");

		const { to, text, type } = messageData;
		await db
			.collection("messages")
			.insertOne({ from: user, to, text, type, time: getNowTime() });
		return res.sendStatus(201);
	} catch (error) {
		return res.status(500).send(error.message);
	}
});

server.get("/messages", async (req, res) => {
	const { user } = req.headers;
	const { limit } = req.query;

	const schema = Joi.object({
		limit: Joi.number().min(1).required(),
	});

	if (Object.keys(req.query).length > 0) {
		const validation = schema.validate(req.query, { abortEarly: false });

		if (validation.error) {
			const errors = validation.error.details.map(
				(detail) => detail.message
			);
			return res.status(422).send(errors);
		}
	}

	try {
		const messages = await db.collection("messages").find().toArray();

		let filteredMessages = messages.filter(
			(message) =>
				message.to === user ||
				message.to === "Todos" ||
				message.from === user
		);

		if (limit) {
			if (limit < 0) return res.sendStatus(422);
			filteredMessages = filteredMessages
				.slice(-parseInt(limit))
				.reverse();
		}

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

		if (!foundMessage)
			return res
				.status(404)
				.send("Messagem n??o existe ou n??o foi encontrada");

		if (foundMessage.from !== user) return res.sendStatus(401);

		await db.collection("messages").deleteOne({ _id: ObjectId(id) });

		return res.sendStatus(200);
	} catch (error) {
		console.log(error);
		return res.sendStatus(500);
	}
});

server.put("/messages/:id", async (req, res) => {
	const { text } = req.body;
	const { id } = req.params;
	const { user } = req.headers;

	const schema = Joi.object({
		to: Joi.string().min(1).required(),
		text: Joi.string().min(1).required(),
		type: Joi.string().valid("message", "private_message").required(),
	});

	if (!user)
		return res
			.status(422)
			.send("Cabe??alho deve ter formato v??lido / conter 'user'!");

	const validation = schema.validate(req.body, { abortEarly: false });

	if (validation.error) {
		const errors = validation.error.details.map((detail) => detail.message);
		return res.status(422).send(errors);
	}

	try {
		const foundMessage = await db
			.collection("messages")
			.findOne({ _id: ObjectId(id) });

		if (!foundMessage) return res.sendStatus(404);

		if (foundMessage.from !== user) return res.sendStatus(401);

		await db
			.collection("messages")
			.updateOne({ _id: ObjectId(id) }, { $set: { text } });

		return res.sendStatus(200);
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
		db = await mongoClient.db();
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
// 200: Ok => Significa que deu tudo certo com a requisi????o
// 201: Created => Sucesso na cria????o do recurso
// 301: Moved Permanently => Significa que o recurso que voc?? est?? tentando acessar foi movido pra outra URL
// 401: Unauthorized => Significa que voc?? n??o tem acesso a esse recurso
// 404: Not Found => Significa que o recurso pedido n??o existe
// 409: Conflict => Significa que o recurso que voc?? est?? tentando inserir j?? foi inserido
// 422: Unprocessable Entity => Significa que a requisi????o enviada n??o est?? no formato esperado
// 500: Internal Server Error => Significa que ocorreu algum erro desconhecido no servidor
