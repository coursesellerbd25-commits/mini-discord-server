"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db");
const userMessageCounts = new Map();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.get("/token", (_, res) => {
    const token = jsonwebtoken_1.default.sign({
        userId: 1,
        username: "Sultana",
    }, process.env.JWT_SECRET, {
        expiresIn: "1h",
    });
    res.json({ token });
});
db_1.pool.query("SELECT NOW()").then(() => {
    console.log("Database Connected");
}).catch((err) => {
    console.error(err);
});
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
    },
});
app.get("/", (_, res) => {
    res.send("Chat Server Running");
});
app.get("/messages/:room", async (req, res) => {
    const { room } = req.params;
    const result = await db_1.pool.query(`SELECT * FROM messages WHERE room = $1 ORDER BY created_at ASC`, [room]);
    res.json(result.rows);
});
const onlineUsers = new Set();
const MESSAGE_LIMIT = 5; // Max 5 messages
const TIME_WINDOW = 10000; // 10 seconds
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    try {
        jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        next();
    }
    catch {
        next(new Error("Authentication failed"));
    }
});
io.on("connection", (socket) => {
    socket.on("typing", ({ room, username }) => {
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
        }
        else {
            if (now - userData.timestamp > TIME_WINDOW) {
                userData.count = 1;
                userData.timestamp = now;
            }
            else {
                userData.count++;
            }
            if (userData.count > MESSAGE_LIMIT) {
                console.log("Count:", userData.count);
                console.log("RATE LIMITED:", socket.id);
                socket.emit("rate-limit", "Too many messages. Slow down.");
                return;
            }
        }
        await db_1.pool.query("INSERT INTO messages (room, username, message) VALUES ($1, $2, $3)", [room, "Sultana", message,]);
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
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map