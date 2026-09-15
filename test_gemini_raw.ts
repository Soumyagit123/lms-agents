import { config } from 'dotenv';
config();

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Testing raw fetch to Gemini API...");
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{text: "Reply with exactly 'OK'"}]
        }]
      })
    });
    console.log("Status:", response.status);
    const data = await response.json();
    console.log("Data:", JSON.stringify(data).substring(0, 200));
  } catch (e: any) {
    console.error("Error fetching:", e.message);
  }
}
main();
