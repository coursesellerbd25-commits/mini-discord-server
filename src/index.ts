import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { pool } from "./db.ts";

const userMessageCounts = new Map<
    string,
    { count: number; timestamp: number }
>();

const app = express();
app.use(cors());

app.get("/token", (_, res) => {
    const token = jwt.sign({ 
        userId: 1,
        username: "Sultana",
    },
    process.env.JWT_SECRET!,
    {
        expiresIn: "1h",
    });
    res.json({ token });
});

pool.query("SELECT NOW()").then(() => {
    console.log("Database Connected");
}).catch((err) => {
    console.error(err);
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

app.get("/", (_, res) => {
    res.send("Chat Server Running");
});

app.get("/messages/:room", async (req, res) => {
    const { room } = req.params;
    const result = await pool.query(
        `SELECT * FROM messages WHERE room = $1 ORDER BY created_at ASC`, 
        [room]
    );
    res.json(result.rows);
});

const onlineUsers = new Set<string>();
const MESSAGE_LIMIT = 5; // Max 5 messages
const TIME_WINDOW = 10000; // 10 seconds

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    try {
        jwt.verify(token, process.env.JWT_SECRET!);
        next();
    } catch {
        next(new Error("Authentication failed"));
    }
});

io.on("connection", (socket) => {
    socket.on("typing",({ room, username }) => {
        socket.to(room).emit("user-typing", username);
    });

    console.log("CONNECTED:", socket.id);
    onlineUsers.add(socket.id);
    console.log("ONLINE COUNT:", onlineUsers.size);
    io.emit("online-users", onlineUsers.size);
    
    let currentRoom = "general";
    socket.join(currentRoom);
    socket.on("join-room", (newRoom) => {
        socket.leave(currentRoom);
        socket.join(newRoom);
        currentRoom = newRoom;
        console.log(socket.id, "joined", newRoom);
    });

    console.log("User connected:", socket.id);
    socket.on("send-message", async ({ room, message }) => {
        console.log("SEND MESSAGE RECEIVED");
        const now = Date.now();
        const userData = userMessageCounts.get(socket.id);
        console.log(userMessageCounts);
        console.log("Current count:", userData?.count);
        
        if (!userData) {
            userMessageCounts.set(socket.id, {
                count: 1,
                timestamp: now,
            });
        } else {
            if (now - userData.timestamp > TIME_WINDOW) {
                userData.count = 1;
                userData.timestamp = now;
            } else {
                userData.count++;
            }
            if (userData.count > MESSAGE_LIMIT) {
                console.log("Count:", userData.count);
                console.log("RATE LIMITED:",socket.id);
                socket.emit("rate-limit", "Too many messages. Slow down.");
                return;
            }
        }

        await pool.query(
            `INSERT INTO messages (room, username, message) VALUES ($1, $2, $3)`,
            [room, "Sultana", message,]
        );
        io.to(room).emit("receive-message", message);
    });

    socket.on("disconnect", () => {
        onlineUsers.delete(socket.id);
        io.emit("online-users", onlineUsers.size);
        console.log("Online:", onlineUsers.size);
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log("Server running on port ${PORT");
});