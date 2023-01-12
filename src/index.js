import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
await connectToDataBase();
setInterval(checkActiveUsers, 15000);

checkActiveUsers();

const server = express();
const PORT = 5000;

server.use(cors());
server.use(express.json());

server.post("/participants", async (req, res) => {
	const { name } = req.body;

	try {
		await db.collection("participants").insertOne({
			name,
			lastStatus: Date.now(),
		});
		return res.sendStatus(201);
	} catch (error) {
		return res.status(500).send(error);
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
	const { to, text, type } = req.body;

	try {
		await db.collection("messages").insertOne({ to, text, type });
		return res.sendStatus(201);
	} catch (error) {
		return res.status(500).send(error.message);
	}
});

server.get("/messages", async (req, res) => {
	console.log("hi");
	try {
		const messages = await db.collection("messages").find().toArray();
		return res.status(200).send(messages);
	} catch (error) {
		return res.status(500).send(error);
	}
});

server.listen(PORT, function () {
	console.log("server is running...");
});

async function checkActiveUsers() {
	console.log("checnking...");
	try {
		const participants = await db
			.collection("participants")
			.find()
			.toArray();

		participants.map(async (participant) => {
			const lastActiveTime = (Date.now() - participant.lastStatus) / 1000;

			if (lastActiveTime > 15) {
				await db.collection("messages").insertOne({
					from: "xxx",
					to: "Todos",
					text: "sai da sala...",
					type: "status",
					time: Date.now(),
				});
				await db
					.collection("participants")
					.deleteOne({ _id: participant._id });
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
		console.log(error);
	}
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
