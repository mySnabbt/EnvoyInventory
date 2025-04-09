const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const pool = require("./db");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

app.post("/ask", async (req, res) => {
  const { question } = req.body;
  console.log("Received question:", question);

  try {
    const prompt = `
You are an AI assistant that answers business questions using SQL.
Given this question: "${question}"
Generate a SQL query for PostgreSQL using a table named "orders" with columns: 
- order_id (integer)
- customer_id (integer)
- order_date (timestamp)
- total (numeric)
- status(text)


Only give the SQL query in your response.
`;

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4", // make sure it's this
      messages: [{ role: "user", content: prompt }],
    });

    console.log("Raw GPT response:", gptRes); // <== log everything

    if (!gptRes || !gptRes.choices || gptRes.choices.length === 0) {
      throw new Error("No valid response from OpenAI");
    }

    const rawText = gptRes.choices[0].message.content.trim();
    console.log("Raw SQL output from AI:\n", rawText);

    const sql = rawText.replace(/```sql|```/g, "").trim();
    console.log("Cleaned SQL:\n", sql);

    const fixedSql = sql.replace(/\borders\b/g, "pos.orders");
    console.log("Final SQL with schema fix:\n", fixedSql);
    const result = await pool.query(fixedSql);

    res.json({ sql, result: result.rows });

  } catch (err) {
    console.error("Error in /ask:", err.message);
    res.status(500).json({
      error: "AI or DB error",
      details: err.message,
    });
  }
});


app.get("/", (req, res) => {
    res.send("AI Analytics Backend is running ✅");
  });  

app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
