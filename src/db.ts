import { Pool } from "pg";

export const pool = new Pool({ 
    user: "postgres",
    password: "sultana26!",
    host: "localhost",
    port: 5432,
    database: "chat_app",
})