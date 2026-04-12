import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// --- Configuration ---
const ffmpegPath = 'C:\\demo\\ffmpeg.exe';

// CLI Arguments
// Usage: node stitch.js <project_folder>
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node stitch.js <project_folder>');
    console.error('Example: node stitch.js project_01');
    process.exit(1);
}

const projectFolder = args[0];

async function main() {
    console.log(`🎬 Project Folder: ${projectFolder}`);

    const segmentsFolder = path.join(projectFolder, 'segments');
    const stitchedFolder = path.join(projectFolder, 'stitched');

    if (!fs.existsSync(segmentsFolder)) {
        console.error(`❌ Segments folder not found: ${segmentsFolder}`);
        process.exit(1);
    }

    if (!fs.existsSync(stitchedFolder)) {
        fs.mkdirSync(stitchedFolder, { recursive: true });
    }

    // Look for S00.mp4, S01.mp4, etc.
    const files = fs.readdirSync(segmentsFolder);
    const segmentFiles = files
        .filter(f => f.match(/^S\d+\.mp4$/i))
        .sort(); // Defaults to alphabetical S00, S01, S02, etc.

    if (segmentFiles.length === 0) {
        console.error(`❌ No valid segment videos (SXX.mp4) found in ${segmentsFolder}`);
        process.exit(1);
    }

    // Extract the last segment's number to construct the output filename
    const lastFile = segmentFiles[segmentFiles.length - 1];
    const lastMatch = lastFile.match(/^S(\d+)\.mp4$/i);
    const lastSegmentNum = lastMatch[1];
    
    // Output format: final-100-0x.mp4
    const outputFilename = `final-s00-${lastSegmentNum}.mp4`.toLowerCase();
    const outputPath = path.join(stitchedFolder, outputFilename);

    console.log(`🔗 Found ${segmentFiles.length} segments to stitch:`);
    segmentFiles.forEach(f => console.log(`   - ${f}`));
    console.log(`🎯 Target output: ${outputFilename}`);

    // Create a temporary text file for the FFmpeg concat demuxer
    const listFile = path.join(projectFolder, 'concat_list.txt');
    
    // FFmpeg concat expects lines like: file 'C:/path/to/S00.mp4'
    // Forward slashes work best for FFmpeg in Windows
    const listContent = segmentFiles
        .map(f => {
            const absolutePath = path.resolve(segmentsFolder, f).replace(/\\/g, '/');
            return `file '${absolutePath}'`;
        })
        .join('\n');
        
    fs.writeFileSync(listFile, listContent);

    // FFmpeg arguments for concat demuxer
    const ffmpegArgs = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        outputPath
    ];

    console.log(`\n⚙️ Spawning FFmpeg to stitch files...`);
    const ffmpeg = spawn(ffmpegPath, ffmpegArgs);

    ffmpeg.on('close', (code) => {
        // Clean up text file
        if (fs.existsSync(listFile)) {
            fs.unlinkSync(listFile);
        }

        if (code === 0) {
            console.log(`✅ Successfully created stitched file: ${outputPath}`);
        } else {
            console.error(`❌ FFmpeg process exited with code ${code}`);
        }
    });

    ffmpeg.on('error', (err) => {
        console.error(`❌ Failed to start ffmpeg: ${err.message}`);
    });
}

main();
