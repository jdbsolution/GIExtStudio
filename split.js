import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

// --- Configuration ---
const ffmpegPath = 'C:\\demo\\ffmpeg.exe';
const ffprobePath = 'C:\\demo\\ffprobe.exe';

// CLI Arguments
// Usage: node split.js <project_folder>
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node split.js <project_folder>');
    console.error('Example: node split.js project_01');
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

// 2. Set input file dynamically based on extension_number
const startSegStr = String(extension_number - 1).padStart(2, '0');
const endSegStr = String(extension_number).padStart(2, '0');
const inputFile = `S${startSegStr}-${endSegStr}.mp4`;

// 3. Read split point from prompts.md
let splitPoint = 5; // seconds from the end
const promptsPath = path.join(projectFolder, 'prompts.md');
if (fs.existsSync(promptsPath)) {
    const promptsContent = fs.readFileSync(promptsPath, 'utf8');
    const projectMatch = promptsContent.match(/# Project[\s\S]*?Split:\s*(\d+)/i);
    if (projectMatch && projectMatch[1]) {
        splitPoint = parseInt(projectMatch[1], 10);
        console.log(`Loaded split point ${splitPoint}s from prompts.md`);
    } else {
        console.log(`Warning: 'Split:' not found under '# Project' in prompts.md. Using default split point: ${splitPoint}s`);
    }
} else {
    console.log(`Warning: prompts.md not found in ${projectFolder}. Using default split point: ${splitPoint}s`);
}

function getDuration(filePath) {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);

        let durationStr = '';
        ffprobe.stdout.on('data', (data) => {
            durationStr += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code === 0) {
                resolve(parseFloat(durationStr.trim()));
            } else {
                reject(new Error(`ffprobe exited with code ${code}`));
            }
        });
        
        ffprobe.on('error', (err) => {
            reject(new Error(`Failed to start ffprobe: ${err.message}`));
        });
    });
}

function runFfmpeg(args, label) {
    return new Promise((resolve, reject) => {
        console.log(`Spawning FFMPEG for ${label}...`);
        const ffmpeg = spawn(ffmpegPath, args);

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Successfully created segment: ${label}`);
                resolve();
            } else {
                console.error(`❌ FFmpeg process exited with code ${code} for ${label}`);
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            console.error(`❌ Failed to start ffmpeg: ${err.message}`);
            reject(err);
        });
    });
}

async function main() {
    console.log(`🎬 Project Folder: ${projectFolder}`);

    const inputPath = path.join(projectFolder, 'raw', inputFile);
    const segmentsFolder = path.join(projectFolder, 'segments');

    if (!fs.existsSync(segmentsFolder)) {
        fs.mkdirSync(segmentsFolder, { recursive: true });
    }

    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const outputFile1 = `S${startSegStr}.mp4`;
    const outputFile2 = `S${endSegStr}.mp4`;

    const outputPath1 = path.join(segmentsFolder, outputFile1);
    const outputPath2 = path.join(segmentsFolder, outputFile2);

    console.log("\n=================================");
    console.log(`🎬 Project Folder: ${projectFolder}`);
    console.log(`✂️ Action: Splitting ${inputPath}`);
    console.log(`⏱️ Split Point: ${splitPoint}s from the end`);
    console.log(`📦 Output 1: ${outputPath1}`);
    console.log(`📦 Output 2: ${outputPath2}`);
    console.log("=================================\n");

    let duration;
    try {
        duration = await getDuration(inputPath);
        console.log(`📏 Video Duration: ${duration.toFixed(2)} seconds`);
    } catch (e) {
        console.error(`❌ Failed to read video duration using ffprobe: ${e.message}`);
        process.exit(1);
    }

    const part1Duration = Math.max(0, duration - splitPoint);

    // Part 1: Start to (Duration - SplitPoint)
    const args1 = [
        '-y',
        '-i', inputPath,
        '-t', part1Duration.toString(),
        '-c:v', 'libx264', '-crf', '18',
        '-c:a', 'aac',
        outputPath1
    ];

    // Part 2: The last <splitPoint> seconds (-sseof trick)
    const args2 = [
        '-y',
        '-sseof', `-${splitPoint}`,
        '-i', inputPath,
        '-c:v', 'libx264', '-crf', '18',
        '-c:a', 'aac',
        outputPath2
    ];

    try {
        await runFfmpeg(args1, outputPath1);
        await runFfmpeg(args2, outputPath2);
        console.log(`🎉 Complete! Saved both parts correctly: ${outputPath1} & ${outputPath2}`);

        const stitchAnswer = await askQuestion('\nDo you want to automatically stitch all segments now? (y/n): ');
        if (stitchAnswer.toLowerCase() === 'y' || stitchAnswer.toLowerCase() === 'yes') {
            console.log(`\n🧵 Running stitch.js for ${projectFolder}...`);
            await new Promise((resolve, reject) => {
                const stitchProc = spawn('node', ['stitch.js', projectFolder], { stdio: 'inherit' });
                stitchProc.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`stitch.js exited with code ${code}`));
                });
            });
            console.log(`\n======================================================`);
            console.log(`🔔 REMINDER: Please update the 'Next' number in the Web UI to ${extension_number + 1} before your next extension request!`);
            console.log(`======================================================\n`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        rl.close();
    }
}

main();
