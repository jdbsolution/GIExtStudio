import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

// CLI Arguments: node extend.js <project_folder>
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: node extend.js <project_folder>");
    console.error("Example: node extend.js project_01");
    process.exit(1);
}
const projectFolder = args[0];

let extension_number = 1;

// 1. Read extension_number from config.txt
const configPath = path.join(projectFolder, 'config.txt');
if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const match = configContent.match(/Next:\s*(\d+)/i);
    if (match && match[1]) {
        extension_number = parseInt(match[1], 10);
        console.log(`Loaded extension number ${extension_number} from config.txt`);
    } else {
        console.log(`'Next:' not found in config.txt, defaulting to extension number ${extension_number}`);
    }
} else {
    console.log(`config.txt not found in ${projectFolder}, defaulting to extension number ${extension_number}`);
}

// 2. Derive the segment video URL dynamically
// REPLACE WITH YOUR VERCEL BLOB URL - Get it from your Vercel dashboard
const baseUrl = "https://YOUR_VERCEL_BLOB_URL_HERE/video/";
const fileIndex = String(extension_number - 1).padStart(2, '0');
const videoUrl = `${baseUrl}S${fileIndex}.mp4`;

// 3. Read prompt and duration from prompts.md
let duration = 5;
let prompt = "Seamlessly continue the video.";

const promptsPath = path.join(projectFolder, 'prompts.md');
if (fs.existsSync(promptsPath)) {
    const promptsContent = fs.readFileSync(promptsPath, 'utf8');
    
    const blockRegex = new RegExp(`# Extension ${extension_number}[\\s\\S]*?(?=# Extension|$)`, 'i');
    const blockMatch = promptsContent.match(blockRegex);
    
    if (blockMatch) {
        const block = blockMatch[0];
        const durationMatch = block.match(/Duration:\s*(\d+)/i);
        if (durationMatch && durationMatch[1]) {
            duration = parseInt(durationMatch[1], 10);
        }
        
        const promptMatch = block.match(/Prompt:\s*([\s\S]*)/i);
        if (promptMatch && promptMatch[1]) {
            prompt = promptMatch[1].trim();
        }
        console.log(`Loaded prompt and duration (${duration}s) from prompts.md for Extension ${extension_number}`);
    } else {
        console.log(`Warning: Could not find '# Extension ${extension_number}' in prompts.md. Using defaults.`);
    }
} else {
    console.log(`Warning: prompts.md not found in ${projectFolder}. Using defaults.`);
}

const quality = "720p"; // reserved for later use

async function extendVideo() {
    console.log("\n=================================");
    console.log("📂 Project Folder:", projectFolder);
    console.log("📹 Requesting video extension...");
    console.log("Input Segment File URL:", videoUrl);
    console.log("Prompt:", prompt);
    console.log("Duration:", duration, "seconds");
    console.log("Extension Number:", extension_number);
    console.log("=================================\n");

    const answer = await askQuestion('Does this look correct? Press Y to submit API request, or N to cancel: ');
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('Cancelled by user.');
        rl.close();
        process.exit(0);
    }

    // 1. Generate video
    const gen = await fetch('https://api.x.ai/v1/videos/extensions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        },
        body: JSON.stringify({
            prompt: prompt,
            model: 'grok-imagine-video',
            video: { url: videoUrl },
            duration: duration,
        }),
    });

    if (!gen.ok) {
        const errText = await gen.text();
        console.error("❌ Failed to request extension:", gen.status, gen.statusText);
        console.error(errText);
        process.exit(1);
    }

    const data = await gen.json();
    const requestId = data.request_id;
    console.log('✅ Request ID:', requestId);

    // 2. Poll for result
    console.log('⏳ Waiting for video extension to generate (this can take several minutes)...');
    
    while (true) {
        await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
        
        const check = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
            },
        });

        if (!check.ok) {
            console.error("❌ Error checking status:", check.status, check.statusText);
            continue;
        }

        const result = await check.json();
        
        if (result.status === 'done' || (result.video && result.video.url)) {
            const finalUrl = result.video.url;
            console.log('🎬 Video extension ready!');
            console.log('URL:', finalUrl);
            console.log('Duration:', result.video.duration, 'seconds');
            
            // Derive tracking name (e.g. S00-01, S01-02, S02-03)
            const previousExtNumStr = (extension_number - 1).toString().padStart(2, '0');
            const currentExtNumStr = extension_number.toString().padStart(2, '0');
            const trackingName = `S${previousExtNumStr}-${currentExtNumStr}`;

            // Derive original file name
            const urlObj = new URL(finalUrl);
            const originalFileName = path.basename(urlObj.pathname) || `extended_${Date.now()}.mp4`;

            // Prepare local folder
            const rawFolder = path.join(projectFolder, 'raw');
            if (!fs.existsSync(rawFolder)) {
                fs.mkdirSync(rawFolder, { recursive: true });
            }
            
            // Download the video
            const localFilePath = path.join(rawFolder, originalFileName);
            console.log(`⬇️ Downloading video to ${localFilePath}...`);
            
            const dlRes = await fetch(finalUrl);
            if (!dlRes.ok) throw new Error(`Failed to download video: ${dlRes.statusText}`);
            
            const arrayBuffer = await dlRes.arrayBuffer();
            fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));
            console.log('✅ Download complete.');

            // Also save a copy with the tracking name (e.g., S00-01.mp4) for the next step
            const trackingFileName = `${trackingName}.mp4`;
            const trackingFilePath = path.join(rawFolder, trackingFileName);
            fs.copyFileSync(localFilePath, trackingFilePath);
            console.log(`✅ Saved tracking copy: ${trackingFilePath}`);

            // Log details
            const logFilePath = path.join(projectFolder, 'log.txt');
            const logEntry = `[${new Date().toISOString()}] URL: ${finalUrl} | File: ${originalFileName} | Tracking: ${trackingName}\n`;
            fs.appendFileSync(logFilePath, logEntry);
            console.log(`📝 Logged to ${logFilePath}`);

            rl.close();
            break;
        } else if (result.status === 'failed') {
            console.error('❌ Video generation failed:', result);
            rl.close();
            break;
        } else if (result.status === 'expired') {
            console.error('❌ Request expired.');
            rl.close();
            break;
        } else {
            // Pending
            process.stdout.write(".");
        }
    }
}

extendVideo().catch((error) => {
    console.error(error);
    rl.close();
}); 
