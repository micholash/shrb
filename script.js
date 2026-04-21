// 🚀 백엔드 서버 주소 (HTML과 동일하게 맞춰줌)
const BACKEND_URL = "http://localhost:5000";

// ❌ 주의: 여기에 절대 Groq API 키를 다시 넣지 마!

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const mCanvas = document.getElementById("minimap");
const mCtx = mCanvas.getContext("2d");

const TILE_SIZE = 25;
const COLS = Math.floor(canvas.width / TILE_SIZE);
const ROWS = Math.floor(canvas.height / TILE_SIZE);
let maze = [], visited = [];
let player = { x: 1, y: 1 };
let exit = { x: COLS - 2, y: ROWS - 2 };
let chaser = { x: COLS - 3, y: ROWS - 2 }; 

const chaserImage = new Image();
chaserImage.src = 'image_0.png'; // 실제 이미지 이름

let gameState = 0; // 0: PLAYING, 1: QUIZ
let gameStartTime = Date.now();

// 🌟 Groq API 직접 호출 대신 파이썬 서버에 요청하는 함수로 변경!
async function getQuizFromAI() {
    try {
        const response = await fetch(`${BACKEND_URL}/generate_quiz`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: "Generate a random math problem." }) // 필요 시 수정
        });
        
        const data = await response.json();
        console.log("서버에서 받은 퀴즈:", data);
        
        // 데이터 파싱 (Groq 응답 구조 기준)
        const quizText = data.choices[0].message.content;
        
        // UI에 퀴즈 띄우는 로직 (네 기존 코드에 맞게 변수명 조정해)
        // document.getElementById("quiz-text").innerText = quizText;
        
    } catch(e) {
        console.error("❌ 퀴즈 생성 통신 실패", e);
    }
}


// =========================================================================
// 🛠️ 아래부터는 네 기존 게임 로직 (수정할 필요 없이 그대로 쓰면 됨!)
// =========================================================================

// 안개 밝히기 함수 (범위를 3칸으로 확장해서 시야 확보)
function revealFog(px, py) {
    for (let y = py - 2; y <= py + 2; y++) {
        for (let x = px - 2; x <= px + 2; x++) {
            if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
                visited[y][x] = true;
            }
        }
    }
}

// 미니맵 그리기, 플레이어 이동 로직, 충돌 처리, Three.js 렌더링 로직 (loop 등)
// 기존 script.js 파일에 있던 나머지 코드들을 여기에 그대로 복사해서 붙여넣기 해줘!
