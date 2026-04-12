import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { put } from '@vercel/blob';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

async function main() {
    const projectFolder = process.argv[2];
    if (!projectFolder) {
        console.error('Please provide a project folder. Example: node upload.js project_01');
        process.exit(1);
    }

    let extension_number = 1;
    const configPath = path.join(projectFolder, 'config.txt');
    if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const match = configContent.match(/Next:\s*(\d+)/i);
        if (match && match[1]) {
            extension_number = parseInt(match[1], 10);
            console.log(`Loaded extension number ${extension_number} from config.txt`);
        }
    } else {
        console.log(`config.txt not found in ${projectFolder}, defaulting to extension number ${extension_number}`);
    }

    const fileIndex = String(extension_number - 1).padStart(2, '0');
    const filename = `S${fileIndex}.mp4`;

    const segmentsFolderLower = path.join(projectFolder, 'segments');
    const segmentsFolderUpper = path.join(projectFolder, 'Segments');
    
    let filePath = path.join(segmentsFolderLower, filename);
    if (!fs.existsSync(filePath)) {
        filePath = path.join(segmentsFolderUpper, filename);
    }
    
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filename} in segments folder of ${projectFolder}`);
        process.exit(1);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const destination = `video/${filename}`;

    console.log(`Uploading ${filePath} to Vercel Blob as ${destination}...`);

    try {
        const blob = await put(destination, fileBuffer, {
            access: 'public',
        });
        console.log(`Upload successful! Public URL: ${blob.url}`);
    } catch (error) {
        if (error.message && error.message.includes('already exists')) {
            console.log('File already exists on Vercel Blob.');
            const answer = await askQuestion('Do you want to overwrite it? (y/n): ');
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                console.log(`Overwriting ${destination}...`);
                const blob = await put(destination, fileBuffer, {
                    access: 'public',
                    addRandomSuffix: false,
                    allowOverwrite: true,
                });
                console.log(`Overwrite successful! Public URL: ${blob.url}`);
            } else {
                console.log('Upload cancelled.');
            }
        } else {
            console.error('Error uploading to Vercel Blob:', error);
        }
    } finally {
        rl.close();
    }
}

main();
