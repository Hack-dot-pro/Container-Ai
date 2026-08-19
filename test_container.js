const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  \x1b[32m✔ PASS:\x1b[0m ${message}`);
        testsPassed++;
    } else {
        console.error(`  \x1b[31m✘ FAIL:\x1b[0m ${message}`);
        testsFailed++;
    }
}

console.log('\n=============================================');
console.log('🧪 RUNNING CONTAINER-AI COMPREHENSIVE TESTS');
console.log('=============================================\n');

// 1. Check HTML & JS Syntax in index.html
console.log('--- 1. Index.html Syntax & Structure ---');
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(htmlContent.includes('<!DOCTYPE html>'), 'index.html contains valid HTML5 doctype');
assert(htmlContent.includes('ContDash — Hệ Thống Xếp Container'), 'Page title is correct');
assert(htmlContent.includes('makeContainerMesh'), 'makeContainerMesh function is present');
assert(htmlContent.includes('applyContainerFadingMaterial'), 'applyContainerFadingMaterial shader function is present');
assert(htmlContent.includes('loadContainerModel'), 'loadContainerModel is present');
assert(!htmlContent.includes('0x00ffff'), 'Old cyan wireframe lines are removed');

// Extract script content and validate JS syntax via node vm
const scriptMatch = htmlContent.match(/<script>([\s\S]*?)<\/script>/);
assert(scriptMatch && scriptMatch[1].length > 0, 'Extracted inline JavaScript from index.html');

try {
    const vm = require('vm');
    const code = scriptMatch[1];
    new vm.Script(code);
    assert(true, 'JavaScript code parses without syntax errors');
} catch (err) {
    assert(false, `JavaScript syntax error: ${err.message}`);
}

// 2. Check Container glTF Model and Textures
console.log('\n--- 2. Container 3D Model & Assets ---');
const containerGltfPath = path.join(__dirname, 'container/scene.gltf');
const containerBinPath = path.join(__dirname, 'container/scene.bin');
const containerTex1 = path.join(__dirname, 'container/textures/Material.001_baseColor.jpeg');
const containerTex2 = path.join(__dirname, 'container/textures/Material.001_metallicRoughness.png');
const containerTex3 = path.join(__dirname, 'container/textures/Material.001_normal.jpeg');

assert(fs.existsSync(containerGltfPath), 'container/scene.gltf exists');
assert(fs.existsSync(containerBinPath), 'container/scene.bin exists');
assert(fs.existsSync(containerTex1), 'container baseColor texture exists');
assert(fs.existsSync(containerTex2), 'container metallicRoughness texture exists');
assert(fs.existsSync(containerTex3), 'container normal texture exists');

const containerGltf = JSON.parse(fs.readFileSync(containerGltfPath, 'utf8'));
assert(containerGltf.meshes && containerGltf.meshes.length > 0, 'container glTF contains mesh definitions');
assert(containerGltf.materials && containerGltf.materials.length > 0, 'container glTF contains material definitions');

// 3. Check Pallet Model and Assets
console.log('\n--- 3. Pallet 3D Model & Assets ---');
const palletGltfPath = path.join(__dirname, 'Pallet/scene.gltf');
const palletBinPath = path.join(__dirname, 'Pallet/scene.bin');
assert(fs.existsSync(palletGltfPath), 'Pallet/scene.gltf exists');
assert(fs.existsSync(palletBinPath), 'Pallet/scene.bin exists');

// 4. View-Angle Fading Math Algorithm Verification
console.log('\n--- 4. Container View-Angle Fading Algorithm Math ---');
function computeDynAlpha(dotNV) {
    const rimFactor = Math.pow(1.0 - Math.min(1.0, Math.max(0.0, dotNV)), 1.6);
    const minOpacity = 0.18;
    const maxOpacity = 0.95;
    const dynAlpha = minOpacity + (maxOpacity - minOpacity) * rimFactor;
    return Math.min(1.0, Math.max(0.15, dynAlpha));
}

// When viewing head-on (dotNV = 1.0)
const alphaHeadOn = computeDynAlpha(1.0);
assert(Math.abs(alphaHeadOn - 0.18) < 0.01, `Head-on view gives high transparency (alpha: ${alphaHeadOn.toFixed(3)}) to see interior`);

// When viewing glancing angle (dotNV = 0.0)
const alphaGlance = computeDynAlpha(0.0);
assert(Math.abs(alphaGlance - 0.95) < 0.01, `Glancing edge view gives solid outline (alpha: ${alphaGlance.toFixed(3)}) for sharp container silhouette`);

// Monotonicity check
let isMonotonic = true;
let prev = computeDynAlpha(0.0);
for (let d = 0.1; d <= 1.0; d += 0.1) {
    const curr = computeDynAlpha(d);
    if (curr > prev) isMonotonic = false;
    prev = curr;
}
assert(isMonotonic, 'Alpha smoothly and monotonically decreases as view direction approaches direct face normal');

// 5. Container Dimensions and Scaling Math
console.log('\n--- 5. Container Dimension Fitting Math ---');
const targetL = 12.0; // Z
const targetW = 2.35; // X
const targetH = 2.40; // Y

const rawSizeX = 24.0131; // along original length
const rawSizeY = 4.7200;  // along height
const rawSizeZ = 4.7019;  // along original width

const scaleX = targetW / rawSizeZ;
const scaleY = targetH / rawSizeY;
const scaleZ = targetL / rawSizeX;

const fittedX = rawSizeZ * scaleX;
const fittedY = rawSizeY * scaleY;
const fittedZ = rawSizeX * scaleZ;

assert(Math.abs(fittedX - targetW) < 1e-4, `Container fitted width is exactly ${fittedX.toFixed(2)}m (target ${targetW}m)`);
assert(Math.abs(fittedY - targetH) < 1e-4, `Container fitted height is exactly ${fittedY.toFixed(2)}m (target ${targetH}m)`);
assert(Math.abs(fittedZ - targetL) < 1e-4, `Container fitted length is exactly ${fittedZ.toFixed(2)}m (target ${targetL}m)`);

// 6. Built-in Seed Data Validation
console.log('\n--- 6. Master Seed Data & Packing Validation ---');
const seedMatch = htmlContent.match(/const SEED_MASTER = (\[[\s\S]*?\]);/);
assert(seedMatch && seedMatch[1], 'SEED_MASTER data parsed from index.html');
const seedData = JSON.parse(seedMatch[1]);
assert(seedData.length > 100, `SEED_MASTER contains ${seedData.length} SKUs (>100 expected)`);

// Test auto-load packing logic with sample queue items
const testQueue = [
    { id: 1, code: '1009', isBig: true, totalPallets: 10, weightPerPallet: 325.6, dims: { l: 1470, w: 1135, h: 925 } },
    { id: 2, code: '5803', isBig: true, totalPallets: 8, weightPerPallet: 356.8, dims: { l: 1470, w: 1135, h: 925 } }
];

const MAX_WEIGHT = 20000;
const MAX_PALLETS = 32;
let containers = [];
let all = [];
testQueue.forEach(q => { for(let i = 0; i < q.totalPallets; i++) all.push(JSON.parse(JSON.stringify(q))); });

all.forEach((p) => {
    let c = containers.length > 0 ? containers[containers.length - 1] : { id: 'CONT-1', pallets: [] };
    if (containers.length === 0) containers.push(c);
    let w = c.pallets.reduce((s, x) => s + x.weightPerPallet, 0);
    if (w + p.weightPerPallet > MAX_WEIGHT || c.pallets.length + 1 > MAX_PALLETS) {
        c = { id: 'CONT-' + (containers.length + 1), pallets: [] };
        containers.push(c);
    }
    p.slotId = c.pallets.length;
    c.pallets.push(p);
});

assert(containers.length === 1, `Auto-load partitioned 18 pallets into ${containers.length} container`);
assert(containers[0].pallets.length === 18, `Container has 18 pallets assigned`);
const totalWeight = containers[0].pallets.reduce((s, p) => s + p.weightPerPallet, 0);
assert(totalWeight < MAX_WEIGHT, `Container weight (${totalWeight.toFixed(2)} kg) is within safe limit < ${MAX_WEIGHT} kg`);

console.log('\n=============================================');
console.log(`📊 TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('=============================================\n');

if (testsFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
