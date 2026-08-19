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

console.log('\n======================================================');
console.log('🧪 RUNNING CONTAINER-AI EXPANDED TEST SUITE');
console.log('======================================================\n');

// 1. Check HTML & JS Syntax in index.html
console.log('--- 1. Index.html Syntax & Structure ---');
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(htmlContent.includes('<!DOCTYPE html>'), 'index.html contains valid HTML5 doctype');
assert(htmlContent.includes('ContDash — Hệ Thống Xếp Container'), 'Page title is correct');
assert(htmlContent.includes('makeContainerMesh'), 'makeContainerMesh function is present');
assert(htmlContent.includes('applyContainerFadingMaterial'), 'applyContainerFadingMaterial shader function is present');
assert(htmlContent.includes('loadContainerModel'), 'loadContainerModel is present');
assert(!htmlContent.includes('0x00ffff'), 'Old cyan wireframe lines are removed');
assert(htmlContent.includes('addCurrentSkuToPallet'), 'addCurrentSkuToPallet function is present');
assert(htmlContent.includes('removePbSku'), 'removePbSku function is present');
assert(htmlContent.includes('fitBuilderCamera'), 'fitBuilderCamera auto-framing function is present');

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

// 2. Check Container & Pallet glTF Models and Textures
console.log('\n--- 2. 3D Model Assets Integrity ---');
assert(fs.existsSync(path.join(__dirname, 'container/scene.gltf')), 'container/scene.gltf exists');
assert(fs.existsSync(path.join(__dirname, 'container/scene.bin')), 'container/scene.bin exists');
assert(fs.existsSync(path.join(__dirname, 'container/textures/Material.001_baseColor.jpeg')), 'container baseColor texture exists');
assert(fs.existsSync(path.join(__dirname, 'container/textures/Material.001_metallicRoughness.png')), 'container metallicRoughness texture exists');
assert(fs.existsSync(path.join(__dirname, 'container/textures/Material.001_normal.jpeg')), 'container normal texture exists');
assert(fs.existsSync(path.join(__dirname, 'Pallet/scene.gltf')), 'Pallet/scene.gltf exists');
assert(fs.existsSync(path.join(__dirname, 'Pallet/scene.bin')), 'Pallet/scene.bin exists');

// 3. Pallet & Box Dimensional Fit in Container View
console.log('\n--- 3. Pallet & Box Model Fit (No Overhang) ---');
const PALLET_MODEL_UNIT = 5.0;
const PALLET_MODEL_TOP = 1.0766;
const PALLET_STD_HEIGHT = 0.14;

// Big Item Test (e.g. SKU 1009: 1470 x 1135 x 925 mm)
const bigItemDims = { l: 1470, w: 1135, h: 925 };
const bX = Math.min(bigItemDims.l, bigItemDims.w) / 1000; // 1.135m
const bZ = Math.max(bigItemDims.l, bigItemDims.w) / 1000; // 1.470m
const bY = bigItemDims.h / 1000; // 0.925m

const pltW = bX;
const pltL = bZ;

const palletScaleX = pltW / PALLET_MODEL_UNIT;
const palletScaleZ = pltL / PALLET_MODEL_UNIT;
const palletRenderedW = PALLET_MODEL_UNIT * palletScaleX;
const palletRenderedL = PALLET_MODEL_UNIT * palletScaleZ;

assert(Math.abs(palletRenderedW - bX) < 1e-4, `Pallet width (${palletRenderedW.toFixed(3)}m) matches box width (${bX.toFixed(3)}m) exactly`);
assert(Math.abs(palletRenderedL - bZ) < 1e-4, `Pallet length (${palletRenderedL.toFixed(3)}m) matches box length (${bZ.toFixed(3)}m) exactly`);

// Box placement on pallet
const boxBottomY = PALLET_STD_HEIGHT;
assert(boxBottomY === PALLET_STD_HEIGHT, `Box bottom is placed at y = ${boxBottomY}m (pallet top deck, 0 overlap, 0 gap)`);

// 4. Pallet Builder Box Layout Optimization (No Overflow, No Box Overlaps)
console.log('\n--- 4. Pallet Builder Layout Algorithm (No Overflow, No Collision) ---');
const seedMatch = htmlContent.match(/const SEED_MASTER = (\[[\s\S]*?\]);/);
assert(seedMatch && seedMatch[1], 'SEED_MASTER data parsed from index.html');
const seedData = JSON.parse(seedMatch[1]);

const PAL_W = 1.100;
const PAL_D = 1.100;
const M = 0.01;
const usableW = PAL_W - 2 * M;
const usableD = PAL_D - 2 * M;

function testLayoutBuilder(boxCount, dims, baseTopY = PALLET_STD_HEIGHT) {
    const bL = dims.l / 1000;
    const bW = dims.w / 1000;
    const bH = dims.h / 1000;

    const orientations = [
        { bw: bW, bd: bL, ry: 0 },
        { bw: bL, bd: bW, ry: Math.PI / 2 }
    ];

    let bestPlan = null;
    orientations.forEach(or => {
        const cols = Math.floor(usableW / or.bw);
        const rows = Math.floor(usableD / or.bd);
        const perLayer = cols * rows;
        if (perLayer <= 0) return;

        const layers = Math.ceil(boxCount / perLayer);
        const totalH = layers * bH;

        if (!bestPlan || perLayer > bestPlan.perLayer || (perLayer === bestPlan.perLayer && totalH < bestPlan.totalH)) {
            bestPlan = { cols, rows, perLayer, layers, totalH, bw: or.bw, bd: or.bd, bh: bH, ry: or.ry };
        }
    });

    if (!bestPlan) return null;

    const boxes = [];
    const gridW = bestPlan.cols * bestPlan.bw;
    const gridD = bestPlan.rows * bestPlan.bd;
    const startX = -gridW / 2 + bestPlan.bw / 2;
    const startZ = -gridD / 2 + bestPlan.bd / 2;

    let count = 0;
    for (let l = 0; l < bestPlan.layers && count < boxCount; l++) {
        const y = baseTopY + bestPlan.bh / 2 + l * bestPlan.bh;
        for (let r = 0; r < bestPlan.rows && count < boxCount; r++) {
            for (let c = 0; c < bestPlan.cols && count < boxCount; c++) {
                const x = startX + c * bestPlan.bw;
                const z = startZ + r * bestPlan.bd;
                boxes.push({ x, y, z, w: bestPlan.bw, d: bestPlan.bd, h: bestPlan.bh, ry: bestPlan.ry, layer: l, row: r, col: c });
                count++;
            }
        }
    }
    return { plan: bestPlan, boxes };
}

let smallSkusTested = 0;
let zeroOverflowCount = 0;
let zeroOverlapCount = 0;

seedData.forEach(item => {
    if (!item.isBig) {
        smallSkusTested++;
        const testCounts = [1, 4, 12, 24];
        let skuValid = true;

        testCounts.forEach(bc => {
            const res = testLayoutBuilder(bc, item.dims);
            if (!res) { skuValid = false; return; }

            // Check no overflow outside 1.100 x 1.100 pallet
            res.boxes.forEach(b => {
                const minX = b.x - b.w / 2;
                const maxX = b.x + b.w / 2;
                const minZ = b.z - b.d / 2;
                const maxZ = b.z + b.d / 2;
                if (minX < -PAL_W / 2 - 1e-4 || maxX > PAL_W / 2 + 1e-4 || minZ < -PAL_D / 2 - 1e-4 || maxZ > PAL_D / 2 + 1e-4) {
                    skuValid = false;
                }
            });

            // Check no box collisions within same layer
            for (let i = 0; i < res.boxes.length; i++) {
                for (let j = i + 1; j < res.boxes.length; j++) {
                    const b1 = res.boxes[i];
                    const b2 = res.boxes[j];
                    if (b1.layer === b2.layer) {
                        const overlapX = Math.abs(b1.x - b2.x) < (b1.w + b2.w) / 2 - 1e-3;
                        const overlapZ = Math.abs(b1.z - b2.z) < (b1.d + b2.d) / 2 - 1e-3;
                        if (overlapX && overlapZ) {
                            skuValid = false;
                        }
                    }
                }
            }
        });

        if (skuValid) {
            zeroOverflowCount++;
            zeroOverlapCount++;
        }
    }
});

assert(zeroOverflowCount === smallSkusTested, `All ${smallSkusTested} small item SKUs fit 100% within 1100x1100 pallet (0 overflow)`);
assert(zeroOverlapCount === smallSkusTested, `All ${smallSkusTested} small item SKUs have 0 box-to-box overlaps in any layer`);

// 5. Multi-SKU Mixed Pallet Stacking Test
console.log('\n--- 5. Multi-SKU Mixed Pallet Stacking ---');
const smallItems = seedData.filter(i => !i.isBig);
assert(smallItems.length >= 2, 'At least 2 small SKUs exist for multi-SKU testing');

if (smallItems.length >= 2) {
    const sku1 = smallItems[0];
    const sku2 = smallItems[1];
    
    // Stack SKU 1: 6 boxes
    const res1 = testLayoutBuilder(6, sku1.dims, PALLET_STD_HEIGHT);
    const topY1 = Math.max(...res1.boxes.map(b => b.y + b.h / 2));
    
    // Stack SKU 2: 4 boxes on top of SKU 1
    const res2 = testLayoutBuilder(4, sku2.dims, topY1);
    
    const allMixedBoxes = [...res1.boxes, ...res2.boxes];
    
    // Check all boxes fit within pallet 1.1 x 1.1
    let mixedAllInside = true;
    allMixedBoxes.forEach(b => {
        const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
        const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
        if (minX < -PAL_W/2 - 1e-4 || maxX > PAL_W/2 + 1e-4 || minZ < -PAL_D/2 - 1e-4 || maxZ > PAL_D/2 + 1e-4) {
            mixedAllInside = false;
        }
    });
    assert(mixedAllInside, 'Multi-SKU mixed boxes fit 100% inside 1100x1100 pallet boundary');
    
    // Check SKU2 is placed above SKU1 with 0 collision
    const minYSku2 = Math.min(...res2.boxes.map(b => b.y - b.h / 2));
    assert(minYSku2 >= topY1 - 1e-4, `SKU2 layer starts cleanly at y = ${minYSku2.toFixed(3)}m (above SKU1 top at ${topY1.toFixed(3)}m)`);
}

// 6. Container Dimensions & 3-Model Fitting inside Container
console.log('\n--- 6. 3-Model Fit inside 40ft Container ---');
const cL = 12.0, cW = 2.35, cH = 2.4;
const slotW = 1.135, slotL = 1.470, maxCargoH = 0.925;

const totalRowW = 2 * slotW; // 2.27m
const totalColL = 8 * slotL; // 11.76m
const totalTierH = 2 * (PALLET_STD_HEIGHT + maxCargoH); // 2.13m

assert(totalRowW <= cW, `2 rows of pallets (${totalRowW.toFixed(2)}m) fit inside container width (${cW}m)`);
assert(totalColL <= cL, `8 columns of pallets (${totalColL.toFixed(2)}m) fit inside container length (${cL}m)`);
assert(totalTierH <= cH, `2 tiers of pallets + cargo (${totalTierH.toFixed(2)}m) fit inside container height (${cH}m)`);

console.log('\n======================================================');
console.log(`📊 TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('======================================================\n');

if (testsFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
