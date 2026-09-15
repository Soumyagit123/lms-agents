import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env explicitly
dotenv.config({ path: path.resolve(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ ERROR: GEMINI_API_KEY is not set in the .env file.');
  process.exit(1);
}

console.log('✅ GEMINI_API_KEY found.');
console.log(`Connecting using key: ${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 4)}`);

async function testGemini() {
  console.log('Sending request to Gemini 3.6 Flash...');
  
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3.6-flash',
    apiKey: apiKey,
    maxRetries: 1, // Don't retry infinitely
  });

  const startTime = Date.now();
  
  try {
    // 10 second timeout for the test
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out! Your network is blocking the connection.')), 10000)
    );

    const responsePromise = model.invoke("Say the exact words 'API CONNECTION SUCCESSFUL'.");
    
    // Race between the API call and our 10s timeout
    const res = await Promise.race([responsePromise, timeoutPromise]) as any;

    const duration = Date.now() - startTime;
    console.log(`\n🎉 SUCCESS! Gemini responded in ${duration}ms.`);
    console.log(`AI Response: "${res.content}"`);
  } catch (error: any) {
    console.log(`\n❌ FAILED! Time elapsed: ${Date.now() - startTime}ms`);
    console.error(`Error Details: ${error.message}`);
    console.log('\n--- Troubleshooting ---');
    console.log('If you see a timeout error, it means your local network, ISP, or corporate firewall is actively blocking connections to "generativelanguage.googleapis.com".');
    console.log('You will need to use a VPN or configure proxy settings to bypass the block.');
  }
}

testGemini();
