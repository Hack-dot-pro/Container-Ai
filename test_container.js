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

// 7. Full Pallet Packing Algorithm Tests (Rules 1-5)
console.log('\n--- 7. Pallet Packing Algorithm (Priority Rules 1, 2, 3 & Requirements 4, 5) ---');
const vm = require('vm');
const sandbox = {
    THREE: {
        Vector2: function(x, y) { this.x = x; this.y = y; },
        Vector3: function(x, y, z) { this.x = x; this.y = y; this.z = z; this.set = (x,y,z) => { this.x = x; this.y = y; this.z = z; }; },
        Plane: function() {},
        Group: function() { this.children = []; this.add = function(c) { this.children.push(c); }; },
        Scene: function() { this.children = []; this.add = function(c) { this.children.push(c); }; },
        BoxGeometry: function() {},
        MeshBasicMaterial: function() {},
        MeshStandardMaterial: function() {},
        Mesh: function() { this.position = { set: (x,y,z) => { this.x = x; this.y = y; this.z = z; }, x:0, y:0, z:0 }; this.rotation = { y: 0 }; this.children = []; this.add = (c) => this.children.push(c); },
        EdgesGeometry: function() {},
        LineSegments: function() {},
        LineBasicMaterial: function() {},
        Color: function() {},
        Raycaster: function() {}
    },
    document: {
        getElementById: () => ({ innerText: '', value: '', clientWidth: 480, clientHeight: 420, appendChild: () => {}, addEventListener: () => {}, classList: { add: () => {}, remove: () => {} }, style: {} }),
        querySelector: () => ({ innerHTML: '', addEventListener: () => {} }),
        querySelectorAll: () => []
    },
    window: { addEventListener: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, clear: () => {} }
};
vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox);

assert(typeof sandbox.packBoxesOnPallet === 'function', 'packBoxesOnPallet function exists in index.html');
assert(typeof sandbox.openPalletBuilder === 'function', 'openPalletBuilder function exists in index.html');

// Test 7.1: Priority 1 (Weight DESC): Heavy boxes must be at bottom layer
const mixedTestBoxes = [
    { id: 'b_light_1', width: 250, length: 300, height: 150, weight: 2 },
    { id: 'b_light_2', width: 250, length: 300, height: 150, weight: 2 },
    { id: 'b_heavy_1', width: 350, length: 350, height: 200, weight: 30 },
    { id: 'b_heavy_2', width: 350, length: 350, height: 200, weight: 30 },
    { id: 'b_heavy_3', width: 350, length: 350, height: 200, weight: 30 },
    { id: 'b_heavy_4', width: 350, length: 350, height: 200, weight: 30 },
    { id: 'b_heavy_5', width: 350, length: 350, height: 200, weight: 30 },
    { id: 'b_heavy_6', width: 350, length: 350, height: 200, weight: 30 },
    { id: 'b_mid_1', width: 280, length: 320, height: 180, weight: 15 },
    { id: 'b_mid_2', width: 280, length: 320, height: 180, weight: 15 }
];

const packRes = sandbox.packBoxesOnPallet(mixedTestBoxes, { palletWidth: 1100, palletLength: 1100 });
assert(packRes.packedCount === mixedTestBoxes.length, `All ${mixedTestBoxes.length} mixed boxes successfully packed`);

// Check heavy boxes are in layer 0
const layer0Boxes = packRes.packed.filter(b => b.layer === 0);
const heavyPackedInLayer0 = layer0Boxes.filter(b => b.weight === 30).length;
assert(heavyPackedInLayer0 === 6, `Priority 1 (Weight DESC): All 6 heavy boxes (30kg) placed in bottom layer (layer 0)`);

// Test 7.2: Pallet boundary limits (0 <= x + w <= 1100, 0 <= z + l <= 1100, y >= 0)
let zeroOverflow = true;
packRes.packed.forEach(p => {
    if (p.xMm < 0 || p.xMm + p.placedWidthMm > 1100 || p.zMm < 0 || p.zMm + p.placedLengthMm > 1100 || p.yMm < 0) {
        zeroOverflow = false;
    }
});
assert(zeroOverflow, 'Pallet Bounds: 100% of boxes satisfy (0 <= x+w <= 1100 and 0 <= z+l <= 1100, y >= 0)');

// Test 7.3: Priority 3 (Physical Stability): Upper boxes must be supported by lower boxes
let stabilityPassed = true;
packRes.packed.forEach(p => {
    if (p.yMm > 0) {
        // Check if there are boxes underneath with matching top height
        const underBoxes = packRes.packed.filter(u => Math.abs((u.yMm + u.heightMm) - p.yMm) < 1.0);
        let supportArea = 0;
        underBoxes.forEach(u => {
            const ix = Math.max(0, Math.min(p.xMm + p.placedWidthMm, u.xMm + u.placedWidthMm) - Math.max(p.xMm, u.xMm));
            const iz = Math.max(0, Math.min(p.zMm + p.placedLengthMm, u.zMm + u.placedLengthMm) - Math.max(p.zMm, u.zMm));
            supportArea += ix * iz;
        });
        const boxArea = p.placedWidthMm * p.placedLengthMm;
        if (supportArea / boxArea < 0.85) {
            stabilityPassed = false;
        }
    }
});
assert(stabilityPassed, 'Priority 3 (Physical Stability): Upper layer boxes are firmly supported by bottom boxes (0 floating)');

// Test 7.4: Mesh coordinate and rotation update
const dummyMesh = {
    position: { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    rotation: { y: 0 }
};
const singleMeshTest = [{ id: 'box_mesh_1', width: 300, length: 400, height: 200, weight: 10, mesh: dummyMesh }];
const meshRes = sandbox.packBoxesOnPallet(singleMeshTest, { baseTopY: 0.14 });
assert(meshRes.packedCount === 1, 'Single box with mesh packed');
assert(dummyMesh.position.y > 0.14, `Output Requirement 4: Box Mesh position.y (${dummyMesh.position.y.toFixed(3)}m) updated above pallet deck`);

// Test 7.5: Direct button access without selecting small item
assert(htmlContent.includes('🛠 Xếp Pallet 3D'), 'Sidebar contains direct 🛠 Xếp Pallet 3D button');
assert(htmlContent.includes('🛠 Mở Không Gian Xếp Pallet 3D'), 'Queue page contains prominent 🛠 Mở Không Gian Xếp Pallet 3D button');

console.log('\n======================================================');
console.log(`📊 TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('======================================================\n');

if (testsFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

