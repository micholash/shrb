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

// 🌟 상태 추가: READY (클릭 대기 상태)
const GameState = { READY: -1, PLAYING: 0, QUIZ: 1, GAMEOVER: 2 };
let gameState = GameState.READY; 

let devModeStop = false; // 🌟 개발자 모드 (추적자 정지)
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
    for(let r=2; r<ROWS; r+=4) {
        for(let c=2; c<COLS; c+=4) {
            const light = new THREE.PointLight(0xD4C099, 0.35, 4.5);
            light.position.set(c, 0.4, r);
            scene.add(light);
        }
    }

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
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x3A2A12 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(COLS/2, -0.5, ROWS/2);
    scene.add(floor);

    const ceilGeo = new THREE.PlaneGeometry(COLS, ROWS);
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x5A4A28 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(COLS/2, 0.5, ROWS/2);
    scene.add(ceil);

    if(!exitMesh) {
        const eGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const eMat = new THREE.MeshLambertMaterial({color: 0x118811});
        exitMesh = new THREE.Mesh(eGeo, eMat);
        scene.add(exitMesh);
    }
    exitMesh.position.set(exit.x + 0.5, 0, exit.y + 0.5);

    if(!chaserMesh && chaserTexture) {
        const cGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
        const cMat = new THREE.MeshBasicMaterial({ map: chaserTexture });
        chaserMesh = new THREE.Mesh(cGeo, cMat);
        scene.add(chaserMesh);
    }
}

function spawnChaserRandomly() {
    let valid = false;
    let rx, ry;
    while(!valid) {
        rx = Math.random() * (COLS - 2) + 1;
        ry = Math.random() * (ROWS - 2) + 1;
        let distToPlayer = Math.hypot(rx - player.x, ry - player.y);
        if (distToPlayer >= 5) valid = true;
    }
    chaser.x = rx; chaser.y = ry;
    isChaserActive = true;
    if(chaserMesh) chaserMesh.visible = true;
}

function getTargetLanguage() {
    const rand = Math.random() * 100;
    if (rand < 40) return "Arabic (아랍어)";
    if (rand < 50) return "Korean (한국어)";
    if (rand < 80) return "English (영어)";
    return "Japanese (일본어)";
}

async function fetchMathProblem() {
    if (gameState !== GameState.QUIZ) return;
    document.getElementById("math-panel").classList.remove("hidden");
    document.getElementById("question-text").innerText = "🚨 추격자에게 잡혔다... 문제 생성 중...";
    document.getElementById("options-text").innerHTML = "";

    const targetLang = getTargetLanguage();
    const prompt = `너는 수능 수학 출제 위원이야. 미적분/기하/확통 중 하나를 골라 수능 28번 난이도의 객관식 문제를 1개 만들어. 모든 지문과 보기는 반드시 ${targetLang}로 작성해. 무조건 아래 JSON 형식만 반환해: { "question": "문제", "options": ["1번", "2번", "3번", "4번", "5번"], "answer": "정답번호(1~5)" }`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                temperature: 0.2
            })
        });
        
        const data = await response.json();
        const quiz = JSON.parse(data.choices[0].message.content);
        currentQuestionStr = quiz.question; 
        document.getElementById("question-text").innerText = `🚨 [${targetLang}] ` + quiz.question;
        document.getElementById("options-text").innerHTML = quiz.options.map((opt, i) => `<span style="margin:0 10px;">(${i+1}) ${opt}</span>`).join("");
        currentAnswer = quiz.answer.toString();
        timeLeft = MAX_TIME;
    } catch (e) {
        document.getElementById("question-text").innerText = "❌ 문제 생성 실패. 새로고침 해주세요.";
    }
}

// 🌟 마우스 클릭 시작 제어
canvas3D.addEventListener("click", () => {
    if (gameState === GameState.READY || gameState === GameState.PLAYING) {
        canvas3D.requestPointerLock();
    }
});

document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas3D) {
        // 게임 첫 시작일 때
        if (gameState === GameState.READY) {
            gameState = GameState.PLAYING;
            if (gameStartTime === 0) gameStartTime = Date.now(); // 최초 클릭 시 타이머 시작
        }
        document.getElementById("instruction").style.display = "none";
    } else {
        // 게임 중 ESC 눌렀을 때
        if (gameState === GameState.PLAYING) {
            gameState = GameState.READY; // 멈춤 상태로 변경
            document.getElementById("instruction").innerText = "화면을 클릭하여 계속하세요\n(개발자 모드: Ctrl + F)";
            document.getElementById("instruction").style.display = "block";
        }
    }
});

document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas3D && gameState === GameState.PLAYING) {
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)); 
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
});

window.addEventListener("keydown", (e) => {
    // 🌟 개발자 모드: Ctrl + F 누르면 추격자 정지/재개
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        devModeStop = !devModeStop;
        console.log(devModeStop ? "🛠️ 개발자 모드: 추격자 정지됨" : "🛠️ 개발자 모드: 추격자 이동 재개");
        return;
    }

    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;

    if (gameState === GameState.QUIZ && ["1","2","3","4","5"].includes(e.key)) {
        quizStats.totalAttempted++; 
        if (e.key === currentAnswer) {
            quizStats.correctAnswers++; 
            document.getElementById("math-panel").classList.add("hidden");
            
            // 🌟 정답 맞추면 추적자를 다른 곳에 스폰하고 다시 화면 클릭을 기다림
            spawnChaserRandomly();
            gameState = GameState.READY;
            document.getElementById("instruction").innerText = "화면을 클릭하여 심연으로 진입하세요\n(마우스 고정 해제: ESC)";
            document.getElementById("instruction").style.display = "block";
            
        } else {
            quizStats.wrongQuestions.push({ question: currentQuestionStr, myAnswer: e.key, realAnswer: currentAnswer });
            document.getElementById("question-text").innerText = `❌ 오답! (정답: ${currentAnswer}번)`;
            setTimeout(() => { alert("❌ 오답! 심연에 잡아먹혔습니다."); resetGame(); }, 2000);
        }
    }
});

window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

function movePlayer() {
    let dx = 0, dz = 0;
    if (keys.w) { dx -= Math.sin(yaw) * PLAYER_SPEED; dz -= Math.cos(yaw) * PLAYER_SPEED; }
    if (keys.s) { dx += Math.sin(yaw) * PLAYER_SPEED; dz += Math.cos(yaw) * PLAYER_SPEED; }
    if (keys.a) { dx -= Math.cos(yaw) * PLAYER_SPEED; dz += Math.sin(yaw) * PLAYER_SPEED; }
    if (keys.d) { dx += Math.cos(yaw) * PLAYER_SPEED; dz -= Math.sin(yaw) * PLAYER_SPEED; }

    let pad = 0.2; 
    let checkX = Math.floor(player.x + dx + Math.sign(dx) * pad);
    if (maze[Math.floor(player.y)] && maze[Math.floor(player.y)][checkX] === 0) player.x += dx;
    let checkY = Math.floor(player.y + dz + Math.sign(dz) * pad);
    if (maze[checkY] && maze[checkY][Math.floor(player.x)] === 0) player.y += dz;

    for(let i=-2; i<=2; i++) {
        for(let j=-2; j<=2; j++) {
            if(maze[Math.floor(player.y)+i] && maze[Math.floor(player.y)+i][Math.floor(player.x)+j] !== undefined) 
                visited[Math.floor(player.y)+i][Math.floor(player.x)+j] = true;
        }
    }
    camera.position.set(player.x, 0, player.y);
}

function moveChaser() {
    // 🌟 개발자 모드 켜졌으면 추격자 정지
    if (!isChaserActive || devModeStop) return;
    
    let dx = player.x - chaser.x, dy = player.y - chaser.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > 0.05) { chaser.x += (dx / dist) * CHASER_SPEED; chaser.y += (dy / dist) * CHASER_SPEED; }
    if (chaserMesh) {
        chaserMesh.position.set(chaser.x, 0, chaser.y);
        chaserMesh.rotation.x += 0.02; chaserMesh.rotation.y += 0.03;
    }
}

function drawMinimap() {
    mCtx.fillStyle = "#000"; mCtx.fillRect(0, 0, mCanvas.width, mCanvas.height);
    const mStepX = mCanvas.width / COLS, mStepY = mCanvas.height / ROWS;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (visited[y][x]) { 
                mCtx.fillStyle = maze[y][x] === 1 ? "#443" : "#111"; 
                mCtx.fillRect(x * mStepX, y * mStepY, mStepX, mStepY); 
            }
        }
    }
    mCtx.fillStyle = "#228822"; mCtx.fillRect(exit.x * mStepX, exit.y * mStepY, mStepX, mStepY); 
    mCtx.fillStyle = "#fff"; 
    mCtx.beginPath(); mCtx.arc(player.x * mStepX, player.y * mStepY, 3, 0, Math.PI * 2); mCtx.fill();
    mCtx.strokeStyle = "#888";
    mCtx.beginPath(); mCtx.moveTo(player.x * mStepX, player.y * mStepY);
    mCtx.lineTo((player.x - Math.sin(yaw) * 2) * mStepX, (player.y - Math.cos(yaw) * 2) * mStepY);
    mCtx.stroke();
    if (isChaserActive) {
        mCtx.fillStyle = devModeStop ? "#0000ff" : "#aa0000"; // 개발자 모드 시 미니맵 점 파란색으로 표시
        mCtx.beginPath(); mCtx.arc(chaser.x * mStepX, chaser.y * mStepY, 3, 0, Math.PI * 2); mCtx.fill();
    }
}

function update() {
    if (gameState === GameState.PLAYING) {
        movePlayer(); moveChaser();
        
        // 추격자 충돌
        if (isChaserActive && Math.hypot(player.x - chaser.x, player.y - chaser.y) < 0.6) {
            document.exitPointerLock(); 
            gameState = GameState.QUIZ; 
            fetchMathProblem();
        }
        
        // 출구 탈출
        if (Math.hypot(player.x - (exit.x + 0.5), player.y - (exit.y + 0.5)) < 0.8) {
            let clearTimeSeconds = parseFloat(((Date.now() - gameStartTime) / 1000).toFixed(2));
            document.exitPointerLock();
            alert(`🎉 탈출 성공!\n⏱️ 시간: ${clearTimeSeconds}초\n✅ 정답: ${quizStats.correctAnswers}개`);
            if (window.saveGameStats) {
                window.saveGameStats({ clearTime: clearTimeSeconds, ...quizStats });
            }
            resetGame();
        }
    } else if (gameState === GameState.QUIZ) {
        timeLeft -= 16.6; 
        if (timeLeft <= 0) { alert("시간 초과!"); resetGame(); }
        document.getElementById("timer-fill").style.width = (timeLeft / MAX_TIME * 100) + "%";
    }
}

function resetGame() {
    maze = generateMaze(COLS, ROWS); player = { x: 1.5, y: 1.5 };
    pitch = 0; yaw = 0; camera.rotation.set(0, 0, 0);
    chaser = { x: exit.x + 0.5, y: exit.y + 0.5 }; 
    
    // 🌟 초기 상태 초기화
    isChaserActive = true; 
    devModeStop = false; 
    gameState = GameState.READY; 
    gameStartTime = 0; 
    
    if(chaserMesh) chaserMesh.visible = true;
    visited[1][1] = true; 
    
    document.getElementById("math-panel").classList.add("hidden");
    document.getElementById("instruction").innerText = "화면을 클릭하여 심연으로 진입하세요\n(마우스 고정 해제: ESC)";
    document.getElementById("instruction").style.display = "block";
    
    quizStats = { totalAttempted: 0, correctAnswers: 0, wrongQuestions: [] };
    build3DWorld();
}

function loop() {
    update(); renderer.render(scene, camera); drawMinimap(); 
    requestAnimationFrame(loop);
}

const rawImage = new Image();
rawImage.src = 'image_0.png'; 
rawImage.onload = function() {
    chaserTexture = new THREE.CanvasTexture(rawImage);
    resetGame(); loop();
};
rawImage.onerror = function() {
    resetGame(); loop();
};
