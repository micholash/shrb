const GROQ_API_KEY = "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";

const canvas3D = document.getElementById("gameCanvas");
const renderer = new THREE.WebGLRenderer({ canvas: canvas3D, antialias: true });
renderer.setSize(800, 500);
const scene = new THREE.Scene();

const mCanvas = document.getElementById("minimap");
const mCtx = mCanvas.getContext("2d");

const bgColor = 0x0a0a0a;
scene.background = new THREE.Color(bgColor); 
scene.fog = new THREE.Fog(bgColor, 1, 5.5);
const camera = new THREE.PerspectiveCamera(75, 800/500, 0.1, 100);

const COLS = 32, ROWS = 20;
let maze = [], visited = [];
const PLAYER_SPEED = 0.06;
const CHASER_SPEED = PLAYER_SPEED * 1.2;

let player = { x: 1.5, y: 1.5 }; 
let exit = { x: COLS - 2.5, y: ROWS - 2.5 };
let chaser = { x: 0, y: 0 }; 

let pitch = 0, yaw = 0; 
const keys = { w: false, a: false, s: false, d: false };

const GameState = { READY: -1, PLAYING: 0, QUIZ: 1, GAMEOVER: 2 };
let gameState = GameState.READY; 

let devModeStop = false; 
let isChaserActive = true; 

let currentQuestionStr = "", currentAnswer = "";
let timeLeft = 60000; const MAX_TIME = 60000;
let gameStartTime = 0;
let quizStats = { totalAttempted: 0, correctAnswers: 0, wrongQuestions: [] };

let wallMeshes = [], chaserMesh, exitMesh, chaserTexture;

function generateMaze(width, height) {
    let newMaze = Array(height).fill().map(() => Array(width).fill(1));
    visited = Array(height).fill().map(() => Array(width).fill(false));
    function carve(cx, cy) {
        newMaze[cy][cx] = 0;
        let dirs = [[0,-2],[0,2],[-2,0],[2,0]].sort(() => Math.random() - 0.5);
        for (let [dx, dy] of dirs) {
            let nx = cx + dx, ny = cy + dy;
            if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1 && newMaze[ny][nx] === 1) {
                newMaze[cy + dy/2][cx + dx/2] = 0; carve(nx, ny);
            }
        }
    }
    carve(1, 1);
    newMaze[Math.floor(exit.y)][Math.floor(exit.x)] = 0;
    return newMaze;
}

function build3DWorld() {
    wallMeshes.forEach(w => scene.remove(w));
    wallMeshes = [];
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15); 
    scene.add(ambientLight);
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x6A5832 }); 
    for(let r=0; r<ROWS; r++) {
        for(let c=0; c<COLS; c++) {
            if(maze[r][c] === 1) {
                let w = new THREE.Mesh(wallGeo, wallMat);
                w.position.set(c + 0.5, 0, r + 0.5);
                scene.add(w);
                wallMeshes.push(w);
            }
        }
    }
    const floorGeo = new THREE.PlaneGeometry(COLS, ROWS);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(COLS/2, -0.5, ROWS/2);
    scene.add(floor);

    if(!exitMesh) {
        exitMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshLambertMaterial({color: 0x00ff00}));
        scene.add(exitMesh);
    }
    exitMesh.position.set(exit.x + 0.5, 0, exit.y + 0.5);

    if(!chaserMesh && chaserTexture) {
        chaserMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicMaterial({ map: chaserTexture }));
        scene.add(chaserMesh);
    }
}

function spawnChaserRandomly() {
    let valid = false; let rx, ry;
    while(!valid) {
        rx = Math.random() * (COLS - 2) + 1;
        ry = Math.random() * (ROWS - 2) + 1;
        if (Math.hypot(rx - player.x, ry - player.y) >= 5) valid = true;
    }
    chaser.x = rx; chaser.y = ry;
    isChaserActive = true;
    if(chaserMesh) chaserMesh.visible = true;
}

async function fetchMathProblem() {
    if (gameState !== GameState.QUIZ) return;
    document.getElementById("math-panel").classList.remove("hidden");
    const prompt = `수능 수학 미적분/기하/확통 중 수능 28번 난이도 객관식 문제 1개 생성. 무조건 JSON 반환: { "question": "문제", "options": ["1","2","3","4","5"], "answer": "1~5" }`;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } })
        });
        const data = await response.json();
        const quiz = JSON.parse(data.choices[0].message.content);
        currentQuestionStr = quiz.question; 
        document.getElementById("question-text").innerText = quiz.question;
        document.getElementById("options-text").innerHTML = quiz.options.map((opt, i) => `<span style="margin:0 10px;">(${i+1}) ${opt}</span>`).join("");
        currentAnswer = quiz.answer.toString();
        timeLeft = MAX_TIME;
    } catch (e) { document.getElementById("question-text").innerText = "오류 발생. 새로고침 하세요."; }
}

// 이벤트 핸들러
canvas3D.addEventListener("click", () => {
    if (gameState === GameState.READY || gameState === GameState.PLAYING) canvas3D.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas3D) {
        if (gameState === GameState.READY) {
            gameState = GameState.PLAYING;
            if (gameStartTime === 0) gameStartTime = Date.now();
        }
        document.getElementById("instruction").style.display = "none";
    } else {
        if (gameState === GameState.PLAYING) {
            gameState = GameState.READY;
            document.getElementById("instruction").innerText = "화면을 클릭하여 계속하세요\n(개발자 모드: Ctrl + F)";
            document.getElementById("instruction").style.display = "block";
        }
    }
});

document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas3D && gameState === GameState.PLAYING) {
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch)); 
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
});

window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault(); devModeStop = !devModeStop;
        console.log(devModeStop ? "🛠️ 추격자 정지" : "🛠️ 추격자 재개"); return;
    }
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;

    if (gameState === GameState.QUIZ && ["1","2","3","4","5"].includes(e.key)) {
        quizStats.totalAttempted++; 
        if (e.key === currentAnswer) {
            quizStats.correctAnswers++; 
            document.getElementById("math-panel").classList.add("hidden");
            spawnChaserRandomly();
            gameState = GameState.READY;
            document.getElementById("instruction").innerText = "화면을 클릭하여 심연으로 진입하세요";
            document.getElementById("instruction").style.display = "block";
        } else {
            alert("오답!"); resetGame();
        }
    }
});

window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase(); if (keys.hasOwnProperty(key)) keys[key] = false;
});

function update() {
    if (gameState === GameState.PLAYING) {
        let dx = 0, dz = 0;
        if (keys.w) { dx -= Math.sin(yaw) * PLAYER_SPEED; dz -= Math.cos(yaw) * PLAYER_SPEED; }
        if (keys.s) { dx += Math.sin(yaw) * PLAYER_SPEED; dz += Math.cos(yaw) * PLAYER_SPEED; }
        if (keys.a) { dx -= Math.cos(yaw) * PLAYER_SPEED; dz += Math.sin(yaw) * PLAYER_SPEED; }
        if (keys.d) { dx += Math.cos(yaw) * PLAYER_SPEED; dz -= Math.sin(yaw) * PLAYER_SPEED; }

        if (maze[Math.floor(player.y)][Math.floor(player.x + dx)] === 0) player.x += dx;
        if (maze[Math.floor(player.y + dz)][Math.floor(player.x)] === 0) player.y += dz;
        visited[Math.floor(player.y)][Math.floor(player.x)] = true;
        camera.position.set(player.x, 0, player.y);

        if (!devModeStop && isChaserActive) {
            let cdx = player.x - chaser.x, cdy = player.y - chaser.y;
            let dist = Math.sqrt(cdx*cdx + cdy*cdy);
            chaser.x += (cdx / dist) * CHASER_SPEED; chaser.y += (cdy / dist) * CHASER_SPEED;
            if (dist < 0.6) { document.exitPointerLock(); gameState = GameState.QUIZ; fetchMathProblem(); }
        }
        if (chaserMesh) chaserMesh.position.set(chaser.x, 0, chaser.y);

        if (Math.hypot(player.x - (exit.x + 0.5), player.y - (exit.y + 0.5)) < 0.8) {
            let time = ((Date.now() - gameStartTime) / 1000).toFixed(2);
            alert(`🎉 탈출 성공! 시간: ${time}초`);
            window.saveGameStats({ clearTime: time, ...quizStats });
            resetGame();
        }
    } else if (gameState === GameState.QUIZ) {
        timeLeft -= 16.6; if (timeLeft <= 0) { alert("시간 초과!"); resetGame(); }
        document.getElementById("timer-fill").style.width = (timeLeft / MAX_TIME * 100) + "%";
    }
}

function drawMinimap() {
    mCtx.fillStyle = "#000"; mCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);
    const sw = mCanvas.width / COLS, sh = mCanvas.height / ROWS;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (visited[y][x]) {
                mCtx.fillStyle = maze[y][x] === 1 ? "#443" : "#111";
                mCtx.fillRect(x * sw, y * sh, sw, sh);
            }
        }
    }
    mCtx.fillStyle = "red"; mCtx.fillRect(chaser.x * sw - 2, chaser.y * sh - 2, 4, 4);
    mCtx.fillStyle = "white"; mCtx.fillRect(player.x * sw - 2, player.y * sh - 2, 4, 4);
}

function resetGame() {
    maze = generateMaze(COLS, ROWS); player = { x: 1.5, y: 1.5 };
    chaser = { x: exit.x + 0.5, y: exit.y + 0.5 };
    gameState = GameState.READY; gameStartTime = 0;
    document.getElementById("math-panel").classList.add("hidden");
    document.getElementById("instruction").innerText = "화면을 클릭하여 심연으로 진입하세요";
    document.getElementById("instruction").style.display = "block";
    quizStats = { totalAttempted: 0, correctAnswers: 0, wrongQuestions: [] };
    build3DWorld();
}

const img = new Image(); img.src = 'image_0.png';
img.onload = () => { 
    chaserTexture = new THREE.CanvasTexture(img); resetGame(); 
    function loop() { update(); renderer.render(scene, camera); drawMinimap(); requestAnimationFrame(loop); }
    loop();
};
