import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { config } from 'dotenv';
config();

async function main() {
  console.log("Testing Gemini API with key:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'undefined');
  try {
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-flash',
      apiKey: process.env.GEMINI_API_KEY,
    });
    console.log("Invoking model...");
    const res = await model.invoke("Reply with exactly 'OK'");
    console.log("Response:", res.content);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
main();
