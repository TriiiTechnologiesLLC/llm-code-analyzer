/**
 * zip-code-analyzer.js (Advanced + Export + Hash + Time Estimation)
 *
 * Features:
 * - .env Configuration Support
 * - File Chunking for Large Files
 * - Multi-pass Analysis (Chunk Analysis -> File Synthesis)
 * - Exports to Markdown and JSON
 * - Input File Integrity Hash (SHA-256)
 * - Time Estimation & Performance Tracking
 * - CommonJS Syntax
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const axios = require('axios');
// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'gpt-oss:20b',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_KB) * 1024 || 100 * 1024,
    chunkSize: parseInt(process.env.CHUNK_SIZE_KB) * 1024 || 40 * 1024,
    extensions: process.env.ALLOWED_EXTENSIONS
        ? process.env.ALLOWED_EXTENSIONS.split(',')
        : ['.js', '.jsx', '.ts', '.php', '.java', '.py', '.go', '.rb', '.c', '.cpp', '.cs', '.css', '.html'],
    timeout: 120000 * 30,
    enableReporting: process.env.ENABLE_REPORTING === 'true',
    outputFormats: process.env.OUTPUT_FORMATS
        ? process.env.OUTPUT_FORMATS.split(',').map(f => f.trim())
        : ['md'],
    reportPrefix: process.env.REPORT_PREFIX || 'analysis_report'
};
// ==========================================
// PROMPTS
// ==========================================
const SYSTEM_PROMPT_CHUNK = `
You are a code analysis assistant. 
Analyze the following CODE SEGMENT provided below. 
Note: This is only PART of a larger file. Do not worry about missing imports/definitions outside this chunk.
Focus ONLY on:
1. Security Vulnerabilities (in this segment).
2. Logic Errors.
3. Bad Practices.
Output ONLY a bulleted list of issues found. If none, write "None found".
`;
const SYSTEM_PROMPT_SYNTHESIS = `
You are a Senior Code Auditor. 
You will be provided with a list of analyses from different chunks of a single file.
Your task is to merge these analyses into a SINGLE, cohesive report.
Combine duplicate issues, reference the code chunks if necessary for context, and provide a final recommendation.
Format:
- Summary
- Security Risks (Priority High/Med/Low)
- Code Quality Issues
- Final Verdict
`;
// ==========================================
// HELPER FUNCTIONS
// ==========================================
const isAllowedExtension = (filename) => {
    const ext = path.extname(filename).toLowerCase();
    return CONFIG.extensions.includes(ext);
};
/**
 * Formats milliseconds into human-readable time (e.g., "2m 30s")
 */
const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
};
/**
 * Splits content into chunks based on newlines to preserve line integrity
 */
const splitContentByLines = (content, sizeLimit) => {
    const lines = content.split('\n');
    const chunks = [];
    let currentChunk = '';
    for (const line of lines) {
        const lineSize = Buffer.byteLength(line, 'utf8') + 1;
        if (currentChunk.length + lineSize > sizeLimit && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
        currentChunk += line + '\n';
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
};
/**
 * Reads file content from AdmZip entry safely
 */
const readFileContent = (entry) => {
    try {
        const buffer = entry.getData();
        if (buffer.length > CONFIG.maxFileSize * 10) {
            return { content: null, error: 'File too large' };
        }
        let content = buffer.toString('utf8');
        if (content.includes('\u0000') && !isAllowedExtension(entry.name)) {
            return { content: null, error: 'Binary detected' };
        }
        return { content: content, error: null };
    } catch (error) {
        return { content: null, error: error.message };
    }
};
/**
 * Calculates SHA-256 hash of the target ZIP file asynchronously
 */
function calculateZipHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}
/**
 * Calls Ollama API
 */
async function callOllama(messages, description) {
    try {
        const response = await axios.post(
            `${CONFIG.host}/api/chat`,
            {
                model: CONFIG.model,
                messages: messages,
                stream: false
            },
            { timeout: CONFIG.timeout }
        );
        return response.data.message.content;
    } catch (error) {
        console.error(`❌ Ollama Error (${description}):`, error.message);
        return null;
    }
}
/**
 * Analyzes chunks individually
 */
async function analyzeChunks(fileName, chunks, chunkCount) {
    const results = [];
    console.log(`   📄 Processing ${chunkCount} chunks for ${fileName}...`);
    for (let i = 0; i < chunks.length; i++) {
        console.log(`      > Chunk ${i + 1}/${chunks.length}...`);
        const chunkAnalysis = await callOllama([
            { role: 'system', content: SYSTEM_PROMPT_CHUNK },
            { role: 'user', content: chunks[i] }
        ], `Chunk ${i+1} of ${fileName}`);
        if (chunkAnalysis) {
            results.push({
                chunkIndex: i + 1,
                analysis: chunkAnalysis
            });
        }
    }
    return results;
}
/**
 * Synthesizes chunk results into one final report
 */
async function synthesizeFile(fileName, chunkResults) {
    if (chunkResults.length === 0) return "No analysis generated.";
    const synthesisContext = chunkResults.map(r =>
        `--- Chunk ${r.chunkIndex} Analysis ---\n${r.analysis}`
    ).join('\n');
    console.log(`      > Synthesizing summary. ..`);
    const synthesis = await callOllama([
        { role: 'system', content: SYSTEM_PROMPT_SYNTHESIS },
        { role: 'user', content: `File: ${fileName}\n\n${synthesisContext}` }
    ], `Synthesis of ${fileName}`);
    return synthesis || "Synthesis failed.";
}
/**
 * Estimates time based on file size (Default: 2 seconds per 100KB)
 */
const estimateTime = (totalKB) => {
    const secondsPer100KB = 2;
    const estimatedSeconds = (totalKB / 100) * secondsPer100KB;
    return Math.max(estimatedSeconds, 1); // Minimum 1 second estimate
};
/**
 * Main analysis logic for a single file
 */
async function processFile(entry, startTime, totalEntries, currentIndex, avgTimePerFile) {
    const { content, error } = readFileContent(entry);

    let obj = JSON.parse(JSON.stringify(entry));

    //console.log(obj);

    let size = parseInt(obj.header.size.split(" ")[0]);//TODO multiple on arg1 'bytes' 'kilobytes * 1000 etc)

    ///console.log(size);

    const fileData = {
        filename: entry.entryName,
        sizeBytes: size,
        status: 'error',
        analysis: '',
        error: '',
        chunks: 0,
        processingTime: 0
    };
    const fileStart = performance.now();
    if (!content || error) {
        fileData.status = 'skipped';
        fileData.error = error || 'Read failed';
        fileData.processingTime = performance.now() - fileStart;
        return fileData;
    }
    const fileSize = Buffer.byteLength(content, 'utf8');
    const estimatedTimeForFile = estimateTime(fileSize / 1024);
    console.log(`   ⏱️ Est: ${formatTime(estimatedTimeForFile * 1000)}...`);
    if (fileSize <= CONFIG.maxFileSize) {
        console.log(`   📄 Analyzing single file (${(fileSize/1024).toFixed(1)}KB)`);
        fileData.chunks = 1;
        const result = await callOllama([
            { role: 'system', content: SYSTEM_PROMPT_CHUNK },
            { role: 'user', content: content }
        ], `Full Analysis: ${entry.name}`);
        fileData.analysis = result || 'Analysis empty.';
        fileData.status = 'success';
    } else {
        console.log(`   📦 Large file detected (${(fileSize/1024).toFixed(1)}KB). Chunking...`);
        const chunks = splitContentByLines(content, CONFIG.chunkSize);
        fileData.chunks = chunks.length;
        const chunkResults = await analyzeChunks(entry.name, chunks, chunks.length);
        const finalReport = await synthesizeFile(entry.name, chunkResults);
        fileData.analysis = finalReport;
        fileData.status = 'success';
    }
    fileData.processingTime = performance.now() - fileStart;
    return fileData;
}
// ==========================================
// REPORT EXPORTERS
// ==========================================
function generateTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
function createFileName(prefix, ext) {
    return `${prefix}_${generateTimestamp()}.${ext}`;
}
function exportMarkdown(reportName, allReports, zipHash, totalProcessingTime, estimatedTotalTime) {
    let mdContent = `# Code Analysis Report\n\n`;
    mdContent += `**Generated:** ${generateTimestamp()}\n`;
    mdContent += `**Model:** ${CONFIG.model}\n`;
    mdContent += `**Zip File:** ${path.basename(reportName)}\n`;
    mdContent += `**Zip Hash (SHA-256):** \`${zipHash}\`\n`;
    mdContent += `**Total Files Processed:** ${allReports.length}\n`;
    mdContent += `**Total Time:** ${formatTime(totalProcessingTime)} (Est: ${formatTime(estimatedTotalTime)})\n`;
    mdContent += `---\n\n`;
    const failedFiles = allReports.filter(r => r.status !== 'success').length;
    const analyzedFiles = allReports.filter(r => r.status === 'success').length;
    mdContent += `### Summary Statistics\n`;
    mdContent += `- ✅ Analyzed: ${analyzedFiles}\n`;
    mdContent += `- ⚠️ Skipped/Failed: ${failedFiles}\n\n`;
    allReports.forEach(r => {
        if (r.status !== 'success') return;
        mdContent += `## 📄 ${r.filename}\n`;
        mdContent += `**Size:** ${(r.sizeBytes / 1024).toFixed(2)}KB | **Chunks:** ${r.chunks}\n`;
        mdContent += `**Processing Time:** ${formatTime(r.processingTime)}\n\n`;
        mdContent += `### Analysis\n`;
        mdContent += `${r.analysis}\n`;
        mdContent += `---\n\n`;
    });
    const filePath = createFileName(CONFIG.reportPrefix, 'md');
    fs.writeFileSync(filePath, mdContent);
    console.log(`\n💾 Markdown report saved to: ${filePath}`);
}
function exportJson(reportName, allReports, zipHash, totalProcessingTime, estimatedTotalTime) {
    const jsonData = {
        meta: {
            generatedAt: new Date().toISOString(),
            model: CONFIG.model,
            sourceZip: reportName,
            sourceZipHash: zipHash,
            totalFiles: allReports.length,
            successful: allReports.filter(r => r.status === 'success').length,
            failed: allReports.filter(r => r.status !== 'success').length,
            totalProcessingTimeMs: totalProcessingTime,
            totalProcessingTimeFormatted: formatTime(totalProcessingTime),
            estimatedTimeMs: estimatedTotalTime,
            estimatedTimeFormatted: formatTime(estimatedTotalTime)
        },
        reports: allReports
    };
    const filePath = createFileName(CONFIG.reportPrefix, 'json');
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
    console.log(`💾 JSON report saved to: ${filePath}`);
}
// ==========================================
// MAIN PROCESS
// ==========================================
async function main() {
    const zipPath = process.argv[2];
    if (!zipPath) {
        console.error('Usage: node index.js <path-to-zip-file>');
        process.exit(1);
    }
    if (!fs.existsSync(zipPath)) {
        console.error(`Error: File not found: ${zipPath}`);
        process.exit(1);
    }
    let zipHash = 'error_calculating_hash';
    try {
        zipHash = await calculateZipHash(zipPath);
    } catch (e) {
        console.warn(`⚠️ Could not calculate file hash: ${e.message}`);
    }
    console.log(`\n🚀 Zip Code Analyzer Initialized`);
    console.log(`📂 Target: ${path.basename(zipPath)}`);
    console.log(`🔐 File Hash (SHA-256): ${zipHash}`);
    console.log(`🤖 Model: ${CONFIG.model}`);
    console.log(`📄 Reporting: ${CONFIG.enableReporting ? 'Enabled' : 'Disabled'}`);
    console.log(`📏 Chunk Size: ${(CONFIG.chunkSize/1024).toFixed(0)}KB`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    let allReports = [];
    let totalProcessingTime = 0;
    let estimatedTotalTime = 0;
    try {
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries().filter(entry => !entry.isDirectory);
        const totalFiles = entries.length;
        console.log(`📂 Archive contains ${entries.length} files.\n`);
        let processedCount = 0;
        for (const entry of entries) {
            const currentSize = Buffer.byteLength(entry.getData().toString('utf8'), 'utf8');
            estimatedTotalTime += estimateTime(currentSize / 1024) * 1000;
            console.log(`\n🔍 Processing: ${entry.name} (${processedCount + 1}/${totalFiles})`);
            if (!isAllowedExtension(entry.name)) {
                console.log(`   ⏭️ Skipped (Extension not allowed)`);
                allReports.push({
                    filename: entry.name,
                    status: 'skipped',
                    error: 'Extension not allowed',
                    sizeBytes: 0,
                    chunks: 0,
                    analysis: '',
                    processingTime: 0
                });
                processedCount++;
                continue;
            }
            const result = await processFile(entry, performance.now(), totalFiles, processedCount, 0);
            totalProcessingTime += result.processingTime;
            allReports.push(result);
            processedCount++;
            if (result.status === 'success') {
                console.log(`\n✅ Analysis Preview:\n${'─'.repeat(50)}`);
                console.log(result.analysis.substring(0, 500) + (result.analysis.length > 500 ? '...' : ''));
                console.log(`${'─'.repeat(50)}\n`);
            } else {
                console.log(`⚠️ Failed: ${result.error}`);
            }
        }
        if (CONFIG.enableReporting) {
            console.log(`\n📝 Generating Reports...`);
            if (CONFIG.outputFormats.includes('md')) {
                exportMarkdown(path.basename(zipPath), allReports, zipHash, totalProcessingTime, estimatedTotalTime);
            }
            if (CONFIG.outputFormats.includes('json')) {
                exportJson(path.basename(zipPath), allReports, zipHash, totalProcessingTime, estimatedTotalTime);
            }
        }
        console.log(`\n⏱️ Total Processing: ${formatTime(totalProcessingTime)} (Est: ${formatTime(estimatedTotalTime)})`);
        console.log(`\n🏁 Process Complete.`);
    } catch (error) {
        console.error(`Fatal Error: ${error.message}`);
        process.exit(1);
    }
}
main();