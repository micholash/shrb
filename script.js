/* =============================================
   장기 (Korean Chess) — script.js
   완전한 규칙 구현:
   - 모든 기물 이동
   - 장군(Check) / 외통수(Checkmate)
   - 빅장(Bikjang / Draw)
   - 포 특수 규칙 (포끼리 못 넘고 못 잡음)
   - 궁성 내 사선 이동 (차, 졸, 궁, 사)
   - 한수쉼 (Pass)
   - 차림 선택 (기본/안상/바깥상)
   - Firebase Realtime DB 승패/점수 저장
   ============================================= */

// ── Firebase ────────────────────────────────────
import { initializeApp }                    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, push, serverTimestamp }
                                            from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
  apiKey:            'AIzaSyAgKtcY9DJe1Yym5pk1qXfduG24o_tu3Pw',
  authDomain:        'aaaaaeeeea.firebaseapp.com',
  databaseURL:       'https://aaaaaeeeea-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:         'aaaaaeeeea',
  storageBucket:     'aaaaaeeeea.firebasestorage.app',
  messagingSenderId: '790823037777',
  appId:             '1:790823037777:web:12e5f349a1a1eb335d0170',
  measurementId:     'G-0D7465HP3D',
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/**
 * 게임 결과를 Firebase Realtime DB의 /gameResults 노드에 저장
 * @param {'초(楚)'|'한(漢)'|'무승부'} winner
 * @param {'checkmate'|'bikjang'|'pass'} reason
 * @param {{ G: number, R: number }} scores
 */
async function saveGameResult(winner, reason, scores) {
  try {
    await push(ref(db, 'gameResults'), {
      winner,
      reason,
      scoreG:    scores.G,
      scoreR:    scores.R,
      timestamp: serverTimestamp(),
    });
    console.log('[Firebase] 결과 저장 완료:', winner, reason, scores);
  } catch (err) {
    console.error('[Firebase] 저장 실패:', err);
  }
}

const canvas = document.getElementById('janggiBoard');
const ctx    = canvas.getContext('2d');

const SPACING = 60;
const MARGIN  = 30;
const COLS    = 9;
const ROWS    = 10;

// ── State ─────────────────────────────────────
let board        = [];
let selected     = null;
let possibleMoves= [];
let currentTurn  = 'G';       // G: 초(선공), R: 한(후공)
let gameStarted  = false;
let passCount    = 0;         // 연속 쉼 횟수 (둘 다 쉬면 무승부)
let capturedG    = [];        // 초가 잡은 말
let capturedR    = [];        // 한이 잡은 말

// 차림 선택: 'default'(기본), 'inner'(안상), 'outer'(바깥상)
let layoutG = 'default';
let layoutR = 'default';

// ── 기물 점수표 ─────────────────────────────────
const PIECE_SCORE = { chariot:13, cannon:7, horse:5, elephant:3, advisor:3, pawn:2, king:0 };

// ── 궁성 정의 ──────────────────────────────────
// 초(G): rows 0-2, cols 3-5
// 한(R): rows 7-9, cols 3-5
function isInPalace(r, c) {
  return (r >= 0 && r <= 2 && c >= 3 && c <= 5) ||
         (r >= 7 && r <= 9 && c >= 3 && c <= 5);
}

// 궁성 내 대각선 교차점 (차/졸/궁/사 사선 이동에 사용)
// 각 궁성의 중심(1,4 / 8,4) 및 꼭짓점 연결 선
const PALACE_DIAG_LINES = [
  // 초 궁성 (rows 0-2, cols 3-5)
  [[0,3],[1,4],[2,5]], [[0,5],[1,4],[2,3]],
  // 한 궁성 (rows 7-9, cols 3-5)
  [[7,3],[8,4],[9,5]], [[7,5],[8,4],[9,3]],
];

function isOnPalaceDiag(r, c) {
  for (const line of PALACE_DIAG_LINES)
    for (const [lr, lc] of line)
      if (lr === r && lc === c) return true;
  return false;
}

// 두 점이 같은 궁성 사선 위에 인접해 있는가?
function arePalaceDiagAdjacent(r1, c1, r2, c2) {
  if (!isOnPalaceDiag(r1,c1) || !isOnPalaceDiag(r2,c2)) return false;
  // 같은 궁성
  const samePalace = (
    (r1<=2 && r2<=2) || (r1>=7 && r2>=7)
  );
  if (!samePalace) return false;
  return Math.abs(r1-r2) === 1 && Math.abs(c1-c2) === 1;
}

// ── 보드 초기화 ────────────────────────────────
function createEmptyBoard() {
  return Array.from({length: ROWS}, () => Array(COLS).fill(null));
}

// 차림에 따른 마-상 배치
// positions: [왼쪽1열, 왼쪽2열, 오른쪽1열(6열), 오른쪽2열(7열)]
// 기본:  마(1), 상(2), 상(6), 마(7)
// 안상:  상(1), 마(2), 마(6), 상(7)
// 바깥상: 상(1), 마(2), 상(6), 마(7) — 양쪽 모두 바깥
function getHorsElephPos(layout) {
  // [col1, col2, col6, col7] for 마/상 at left inner/outer + right inner/outer
  // 기본: col1=馬, col2=象, col6=象, col7=馬
  // 안상: col1=象, col2=馬, col6=馬, col7=象
  // 바깥상: col1=象, col2=馬, col6=象, col7=馬
  if (layout === 'inner')  return ['horse','elephant','horse','elephant'];
  if (layout === 'outer')  return ['elephant','horse','elephant','horse'];
  return                          ['horse','elephant','elephant','horse']; // default
}

function initBoard() {
  board = createEmptyBoard();

  const [g1,g2,g6,g7] = getHorsElephPos(layoutG);
  const [r1,r2,r6,r7] = getHorsElephPos(layoutR);

  const GNAMES = { horse:'馬', elephant:'象' };
  const RNAMES = { horse:'馬', elephant:'象' };

  // 초 (G) — rows 0-3
  board[0][4] = mk('G','king','楚');
  board[0][3] = mk('G','advisor','士');
  board[0][5] = mk('G','advisor','士');
  board[0][0] = mk('G','chariot','車');
  board[0][8] = mk('G','chariot','車');
  board[0][1] = mk('G',g1,GNAMES[g1]);
  board[0][2] = mk('G',g2,GNAMES[g2]);
  board[0][6] = mk('G',g6,GNAMES[g6]);
  board[0][7] = mk('G',g7,GNAMES[g7]);
  board[2][1] = mk('G','cannon','包');
  board[2][7] = mk('G','cannon','包');
  board[3][0] = mk('G','pawn','卒');
  board[3][2] = mk('G','pawn','卒');
  board[3][4] = mk('G','pawn','卒');
  board[3][6] = mk('G','pawn','卒');
  board[3][8] = mk('G','pawn','卒');

  // 한 (R) — rows 6-9
  board[9][4] = mk('R','king','漢');
  board[9][3] = mk('R','advisor','士');
  board[9][5] = mk('R','advisor','士');
  board[9][0] = mk('R','chariot','車');
  board[9][8] = mk('R','chariot','車');
  board[9][1] = mk('R',r1,RNAMES[r1]);
  board[9][2] = mk('R',r2,RNAMES[r2]);
  board[9][6] = mk('R',r6,RNAMES[r6]);
  board[9][7] = mk('R',r7,RNAMES[r7]);
  board[7][1] = mk('R','cannon','包');
  board[7][7] = mk('R','cannon','包');
  board[6][0] = mk('R','pawn','兵');
  board[6][2] = mk('R','pawn','兵');
  board[6][4] = mk('R','pawn','兵');
  board[6][6] = mk('R','pawn','兵');
  board[6][8] = mk('R','pawn','兵');
}

function mk(side, type, name) { return { side, type, name }; }

// ── 이동 규칙 ──────────────────────────────────
function getPossibleMoves(piece, r, c, brd) {
  brd = brd || board;
  const moves = [];
  const { type, side } = piece;

  if (type === 'king') {
    kingAdvisorMoves(r, c, side, brd, moves, true);
  } else if (type === 'advisor') {
    kingAdvisorMoves(r, c, side, brd, moves, false);
  } else if (type === 'chariot') {
    chariotMoves(r, c, side, brd, moves);
  } else if (type === 'cannon') {
    cannonMoves(r, c, side, brd, moves);
  } else if (type === 'horse') {
    horseMoves(r, c, side, brd, moves);
  } else if (type === 'elephant') {
    elephantMoves(r, c, side, brd, moves);
  } else if (type === 'pawn') {
    pawnMoves(r, c, side, brd, moves);
  }

  return moves;
}

function inBounds(r, c) { return r>=0 && r<ROWS && c>=0 && c<COLS; }

function canLand(nr, nc, side, brd) {
  return inBounds(nr,nc) && (!brd[nr][nc] || brd[nr][nc].side !== side);
}

// 궁/사: 궁성 내 상하좌우 + 사선(교차점 있을 때)
function kingAdvisorMoves(r, c, side, brd, moves, isKing) {
  const straight = [[-1,0],[1,0],[0,-1],[0,1]];
  const diag     = [[-1,-1],[-1,1],[1,-1],[1,1]];

  for (const [dr,dc] of straight) {
    const nr=r+dr, nc=c+dc;
    if (isInPalace(nr,nc) && canLand(nr,nc,side,brd))
      moves.push([nr,nc]);
  }
  for (const [dr,dc] of diag) {
    const nr=r+dr, nc=c+dc;
    if (isInPalace(nr,nc) && arePalaceDiagAdjacent(r,c,nr,nc) && canLand(nr,nc,side,brd))
      moves.push([nr,nc]);
  }
}

// 차: 직선 + 궁성 내 사선
function chariotMoves(r, c, side, brd, moves) {
  // 직선
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    for (let i=1; i<Math.max(ROWS,COLS); i++) {
      const nr=r+dr*i, nc=c+dc*i;
      if (!inBounds(nr,nc)) break;
      if (brd[nr][nc]) {
        if (brd[nr][nc].side !== side) moves.push([nr,nc]);
        break;
      }
      moves.push([nr,nc]);
    }
  }
  // 궁성 내 사선: 궁성 대각선 위에 있을 때
  if (isOnPalaceDiag(r,c)) {
    for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      // 사선 방향으로 연장 (궁성 안에서만)
      for (let i=1; i<=2; i++) {
        const nr=r+dr*i, nc=c+dc*i;
        if (!inBounds(nr,nc) || !isInPalace(nr,nc) || !isOnPalaceDiag(nr,nc)) break;
        if (brd[nr][nc]) {
          if (brd[nr][nc].side !== side) moves.push([nr,nc]);
          break;
        }
        moves.push([nr,nc]);
      }
    }
  }
}

// 포: 반드시 다리 하나를 뛰어넘어야 이동/포획
//    포끼리 서로 못 넘고 못 잡음
function cannonMoves(r, c, side, brd, moves) {
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let jumped = false;
    let jumpedPiece = null;
    for (let i=1; i<Math.max(ROWS,COLS); i++) {
      const nr=r+dr*i, nc=c+dc*i;
      if (!inBounds(nr,nc)) break;
      if (brd[nr][nc]) {
        if (!jumped) {
          // 포는 포를 다리로 삼을 수 없음
          if (brd[nr][nc].type === 'cannon') break;
          jumped = true;
          jumpedPiece = brd[nr][nc];
        } else {
          // 뛰어넘은 후: 포는 포를 잡을 수 없음
          if (brd[nr][nc].type === 'cannon') break;
          if (brd[nr][nc].side !== side) moves.push([nr,nc]);
          break;
        }
      } else {
        if (jumped) moves.push([nr,nc]);
      }
    }
  }
  // 궁성 내 사선 포 이동
  if (isOnPalaceDiag(r,c)) {
    for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let jumped = false;
      for (let i=1; i<=2; i++) {
        const nr=r+dr*i, nc=c+dc*i;
        if (!inBounds(nr,nc) || !isInPalace(nr,nc) || !isOnPalaceDiag(nr,nc)) break;
        if (brd[nr][nc]) {
          if (!jumped) {
            if (brd[nr][nc].type === 'cannon') break;
            jumped = true;
          } else {
            if (brd[nr][nc].type === 'cannon') break;
            if (brd[nr][nc].side !== side) moves.push([nr,nc]);
            break;
          }
        } else {
          if (jumped) moves.push([nr,nc]);
        }
      }
    }
  }
}

// 마: 직선 1 + 대각 1, 멱 체크
function horseMoves(r, c, side, brd, moves) {
  const paths = [
    [[-1,0],[-2,-1]], [[-1,0],[-2,1]],
    [[1,0],[2,-1]],   [[1,0],[2,1]],
    [[0,-1],[-1,-2]], [[0,-1],[1,-2]],
    [[0,1],[-1,2]],   [[0,1],[1,2]],
  ];
  for (const [[mr,mc],[nr,nc]] of paths) {
    const er=r+mr, ec=c+mc; // 멱 위치
    const fr=r+nr, fc=c+nc; // 최종 위치
    if (!inBounds(er,ec)) continue;
    if (brd[er][ec]) continue; // 멱 막힘
    if (inBounds(fr,fc) && canLand(fr,fc,side,brd))
      moves.push([fr,fc]);
  }
}

// 상: 직선 1 + 사선 2, 중간 두 칸 멱 체크
function elephantMoves(r, c, side, brd, moves) {
  const paths = [
    [[-1,0],[-2,-1],[-3,-2]], [[-1,0],[-2,1],[-3,2]],
    [[1,0],[2,-1],[3,-2]],    [[1,0],[2,1],[3,2]],
    [[0,-1],[-1,-2],[-2,-3]], [[0,-1],[1,-2],[2,-3]],
    [[0,1],[-1,2],[-2,3]],    [[0,1],[1,2],[2,3]],
  ];
  for (const [d1,d2,[dr,dc]] of paths) {
    const b1r=r+d1[0], b1c=c+d1[1];
    const b2r=r+d2[0], b2c=c+d2[1];
    const nr=r+dr, nc=c+dc;
    if (!inBounds(b1r,b1c)||!inBounds(b2r,b2c)) continue;
    if (brd[b1r][b1c] || brd[b2r][b2c]) continue;
    if (inBounds(nr,nc) && canLand(nr,nc,side,brd))
      moves.push([nr,nc]);
  }
}

// 졸/병: 앞/좌/우, 궁성 내 사선 앞
function pawnMoves(r, c, side, brd, moves) {
  const forward = side === 'G' ? 1 : -1;
  const deltas  = [[forward,0],[0,-1],[0,1]];

  // 궁성 내 대각선 (앞 사선)
  if (isOnPalaceDiag(r,c)) {
    deltas.push([forward,-1],[forward,1]);
  }

  for (const [dr,dc] of deltas) {
    const nr=r+dr, nc=c+dc;
    if (!inBounds(nr,nc)) continue;
    // 궁성 내 사선이면 사선 조건 확인
    if (Math.abs(dr)===1 && Math.abs(dc)===1) {
      if (!isInPalace(r,c) || !arePalaceDiagAdjacent(r,c,nr,nc)) continue;
    }
    if (canLand(nr,nc,side,brd)) moves.push([nr,nc]);
  }
}

// ── 임시 이동으로 장군 여부 확인 ─────────────────
function isInCheck(side, brd) {
  // 해당 side의 왕 위치 찾기
  let kr=-1, kc=-1;
  for (let r=0; r<ROWS; r++)
    for (let c=0; c<COLS; c++)
      if (brd[r][c] && brd[r][c].side===side && brd[r][c].type==='king') {
        kr=r; kc=c;
      }
  if (kr===-1) return false;

  const enemy = side==='G' ? 'R' : 'G';
  for (let r=0; r<ROWS; r++)
    for (let c=0; c<COLS; c++) {
      const p = brd[r][c];
      if (!p || p.side !== enemy) continue;
      const mvs = getPossibleMoves(p, r, c, brd);
      if (mvs.some(([mr,mc]) => mr===kr && mc===kc)) return true;
    }
  return false;
}

// 이동 후 자기 왕이 위험한지 확인 (셀프체크 방지)
function moveResultsInSelfCheck(fr, fc, tr, tc, side) {
  const brdCopy = cloneBoard(board);
  brdCopy[tr][tc] = brdCopy[fr][fc];
  brdCopy[fr][fc] = null;
  return isInCheck(side, brdCopy);
}

function cloneBoard(brd) {
  return brd.map(row => row.map(cell => cell ? {...cell} : null));
}

// 셀프체크 제거 후 실제 유효 이동 목록
function getLegalMoves(piece, r, c) {
  const raw = getPossibleMoves(piece, r, c, board);
  return raw.filter(([tr,tc]) => !moveResultsInSelfCheck(r, c, tr, tc, piece.side));
}

// ── 체크메이트 / 외통수 ─────────────────────────
function isCheckmate(side) {
  for (let r=0; r<ROWS; r++)
    for (let c=0; c<COLS; c++) {
      const p = board[r][c];
      if (!p || p.side !== side) continue;
      if (getLegalMoves(p, r, c).length > 0) return false;
    }
  return true;
}

// ── 빅장 체크 ──────────────────────────────────
// 두 왕이 같은 열(col)에서 사이에 기물 없이 마주 보면 빅장
function isBikjang() {
  let gkr=-1, gkc=-1, rkr=-1, rkc=-1;
  for (let r=0; r<ROWS; r++)
    for (let c=0; c<COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (p.side==='G' && p.type==='king') { gkr=r; gkc=c; }
      if (p.side==='R' && p.type==='king') { rkr=r; rkc=c; }
    }
  if (gkc !== rkc) return false;
  const minR = Math.min(gkr, rkr);
  const maxR = Math.max(gkr, rkr);
  for (let r=minR+1; r<maxR; r++)
    if (board[r][gkc]) return false;
  return true;
}

// ── 점수 계산 ───────────────────────────────────
function calcScore(side) {
  let s = 0;
  const captured = side === 'G' ? capturedG : capturedR;
  for (const p of captured) s += PIECE_SCORE[p.type] || 0;
  return s;
}

// ── 게임 시작 / 리셋 ────────────────────────────
function startGame() {
  gameStarted = true;
  currentTurn = 'G';
  passCount   = 0;
  capturedG   = [];
  capturedR   = [];
  selected     = null;
  possibleMoves= [];
  initBoard();
  updateCapturedUI();
  updateScoreUI();
  updateTurnUI();
  document.getElementById('pass-btn').disabled = false;
  document.getElementById('start-btn').disabled = true;
  disableSetupBtns(true);
  draw();
}

function resetGame() {
  gameStarted  = false;
  currentTurn  = 'G';
  passCount    = 0;
  capturedG    = [];
  capturedR    = [];
  selected     = null;
  possibleMoves= [];
  layoutG      = 'default';
  layoutR      = 'default';
  document.getElementById('modal').style.display = 'none';
  document.getElementById('pass-btn').disabled   = true;
  document.getElementById('start-btn').disabled  = false;
  disableSetupBtns(false);
  updateSetupBtnUI();
  updateCapturedUI();
  updateScoreUI();
  document.getElementById('turn-text').textContent = '초(楚) 선공 · 차림을 선택하세요';
  const dot = document.querySelector('.turn-dot');
  dot.className = 'turn-dot green-dot';
  initBoard();
  draw();
}

function passTurn() {
  if (!gameStarted) return;
  passCount++;
  if (passCount >= 2) {
    const scores = { G: calcScore('G'), R: calcScore('R') };
    showModal('무승부', '두 플레이어 모두 한수쉬어 무승부입니다.');
    saveGameResult('무승부', 'pass', scores);
    return;
  }
  currentTurn = currentTurn === 'G' ? 'R' : 'G';
  selected = null;
  possibleMoves = [];
  updateTurnUI();
  draw();
}

// ── 차림 선택 ───────────────────────────────────
function setLayout(side, layout) {
  if (gameStarted) return;
  if (side === 'G') layoutG = layout;
  else              layoutR = layout;
  updateSetupBtnUI();
  initBoard();
  draw();
}

function updateSetupBtnUI() {
  ['default','inner','outer'].forEach(l => {
    document.getElementById(`g-${l === 'default' ? 'default' : l === 'inner' ? 'inner' : 'outer'}`).classList.toggle('active', layoutG === l);
    document.getElementById(`r-${l === 'default' ? 'default' : l === 'inner' ? 'inner' : 'outer'}`).classList.toggle('active', layoutR === l);
  });
}

function disableSetupBtns(disabled) {
  document.querySelectorAll('.setup-btn').forEach(b => b.disabled = disabled);
}

// ── UI 업데이트 ─────────────────────────────────
function updateTurnUI() {
  const dot  = document.querySelector('.turn-dot');
  const text = document.getElementById('turn-text');
  const inCheck = isInCheck(currentTurn, board);
  const inBik   = isBikjang();

  if (currentTurn === 'G') {
    dot.className = 'turn-dot green-dot pulse';
    text.textContent = '초(楚) 차례' + (inCheck ? ' ⚠ 장군!' : '') + (inBik ? ' ◈ 빅장' : '');
  } else {
    dot.className = 'turn-dot red-dot pulse';
    text.textContent = '한(漢) 차례' + (inCheck ? ' ⚠ 장군!' : '') + (inBik ? ' ◈ 빅장' : '');
  }
}

function updateCapturedUI() {
  const elG = document.getElementById('captured-pieces-G');
  const elR = document.getElementById('captured-pieces-R');
  elG.innerHTML = capturedG.map(p =>
    `<span class="cap-piece red">${p.name}</span>`).join('');
  elR.innerHTML = capturedR.map(p =>
    `<span class="cap-piece green">${p.name}</span>`).join('');
}

function updateScoreUI() {
  document.getElementById('score-G').textContent = `점수: ${calcScore('G')}`;
  document.getElementById('score-R').textContent = `점수: ${calcScore('R')} (+1.5)`;
}

function showModal(title, msg) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent   = msg;
  document.getElementById('modal').style.display     = 'flex';
}

// ── 클릭 이벤트 ─────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  if (!gameStarted) return;

  const rect  = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top)  * scaleY;

  const c = Math.round((mx - MARGIN) / SPACING);
  const r = Math.round((my - MARGIN) / SPACING);

  if (!inBounds(r, c)) return;

  if (selected) {
    const isPossible = possibleMoves.some(([pr,pc]) => pr===r && pc===c);
    if (isPossible) {
      // 이동 실행
      const moving   = board[selected.r][selected.c];
      const captured = board[r][c];

      if (captured) {
        if (moving.side === 'G') capturedG.push(captured);
        else                     capturedR.push(captured);
      }

      board[r][c]                     = moving;
      board[selected.r][selected.c]   = null;
      selected     = null;
      possibleMoves= [];
      passCount    = 0;

      updateCapturedUI();
      updateScoreUI();

      // 상대 턴으로
      currentTurn = currentTurn === 'G' ? 'R' : 'G';
      updateTurnUI();
      draw();

      // 승패 확인
      setTimeout(checkGameState, 50);
    } else {
      // 다른 아군 말 선택
      if (board[r][c] && board[r][c].side === currentTurn) {
        selected      = { r, c };
        possibleMoves = getLegalMoves(board[r][c], r, c);
      } else {
        selected      = null;
        possibleMoves = [];
      }
      draw();
    }
  } else {
    if (board[r][c] && board[r][c].side === currentTurn) {
      selected      = { r, c };
      possibleMoves = getLegalMoves(board[r][c], r, c);
    }
    draw();
  }
});

function checkGameState() {
  // 외통수
  if (isCheckmate(currentTurn)) {
    const winner = currentTurn === 'G' ? '한(漢)' : '초(楚)';
    const loser  = currentTurn === 'G' ? '초(楚)' : '한(漢)';
    const scores = { G: calcScore('G'), R: calcScore('R') };
    showModal('외통수!', `${loser}의 왕이 포위됐습니다.\n${winner} 승리! 🎉`);
    gameStarted = false;
    saveGameResult(winner, 'checkmate', scores);
    return;
  }

  // 빅장: 현재 플레이어가 빅장 상태를 해소 못 하면 무승부 처리
  if (isBikjang()) {
    const scores  = { G: calcScore('G'), R: calcScore('R') + 1.5 };
    const leader  = scores.G > scores.R ? '초(楚)' : scores.R > scores.G ? '한(漢)' : '없음';
    showModal('빅장 (무승부)', `두 왕이 마주보고 있습니다.\n점수: 초 ${scores.G} | 한 ${scores.R.toFixed(1)}\n${leader !== '없음' ? leader + ' 점수 우세' : '동점'}`);
    gameStarted = false;
    saveGameResult('무승부', 'bikjang', scores);
    return;
  }
}

// ── 그리기 ─────────────────────────────────────
const BOARD_BG_COLOR  = '#d4a96a';
const LINE_COLOR      = '#7a4e2a';
const PALACE_LINE_CLR = '#5a3010';

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 보드 배경
  ctx.fillStyle = BOARD_BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 나무결 느낌 미세 grain
  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i=0; i<canvas.height; i+=3) {
    ctx.fillStyle = i%6===0 ? '#3d1a00' : '#f0c070';
    ctx.fillRect(0, i, canvas.width, 1);
  }
  ctx.restore();

  drawGrid();
  drawPalaceDiagonals();
  drawRiver();
  drawMoveHighlights();
  drawPieces();
}

function drawGrid() {
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth   = 1.5;

  for (let i=0; i<ROWS; i++) {
    ctx.beginPath();
    ctx.moveTo(MARGIN, MARGIN + i*SPACING);
    ctx.lineTo(MARGIN + (COLS-1)*SPACING, MARGIN + i*SPACING);
    ctx.stroke();
  }
  for (let j=0; j<COLS; j++) {
    ctx.beginPath();
    ctx.moveTo(MARGIN + j*SPACING, MARGIN);
    ctx.lineTo(MARGIN + j*SPACING, MARGIN + (ROWS-1)*SPACING);
    ctx.stroke();
  }

  // 모서리 강조
  ctx.strokeStyle = '#5a3010';
  ctx.lineWidth   = 3;
  ctx.strokeRect(MARGIN, MARGIN, (COLS-1)*SPACING, (ROWS-1)*SPACING);
}

function drawPalaceDiagonals() {
  ctx.strokeStyle = PALACE_LINE_CLR;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([4,3]);

  // 초 궁성 (top): rows 0-2, cols 3-5
  ctx.beginPath();
  ctx.moveTo(MARGIN+3*SPACING, MARGIN+0*SPACING);
  ctx.lineTo(MARGIN+5*SPACING, MARGIN+2*SPACING);
  ctx.moveTo(MARGIN+5*SPACING, MARGIN+0*SPACING);
  ctx.lineTo(MARGIN+3*SPACING, MARGIN+2*SPACING);
  ctx.stroke();

  // 한 궁성 (bottom): rows 7-9, cols 3-5
  ctx.beginPath();
  ctx.moveTo(MARGIN+3*SPACING, MARGIN+7*SPACING);
  ctx.lineTo(MARGIN+5*SPACING, MARGIN+9*SPACING);
  ctx.moveTo(MARGIN+5*SPACING, MARGIN+7*SPACING);
  ctx.lineTo(MARGIN+3*SPACING, MARGIN+9*SPACING);
  ctx.stroke();

  ctx.setLineDash([]);

  // 궁성 배경
  ctx.fillStyle = 'rgba(200,147,74,0.3)';
  ctx.fillRect(MARGIN+3*SPACING-1, MARGIN, 2*SPACING+2, 2*SPACING);
  ctx.fillRect(MARGIN+3*SPACING-1, MARGIN+7*SPACING, 2*SPACING+2, 2*SPACING);
}

function drawRiver() {
  // 강(楚河漢界) 표시 — rows 4-5 사이 중간
  const ry = MARGIN + 4.5*SPACING;
  ctx.save();
  ctx.fillStyle = 'rgba(100,160,220,0.12)';
  ctx.fillRect(MARGIN, MARGIN+4*SPACING, (COLS-1)*SPACING, SPACING);
  ctx.font = 'italic bold 13px "Noto Serif KR", serif';
  ctx.fillStyle = 'rgba(80,120,180,0.45)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚 河', MARGIN + 2*SPACING, ry);
  ctx.fillText('漢 界', MARGIN + 6*SPACING, ry);
  ctx.restore();
}

function drawMoveHighlights() {
  for (const [r, c] of possibleMoves) {
    const x = MARGIN + c*SPACING;
    const y = MARGIN + r*SPACING;
    const target = board[r][c];

    if (target && target.side !== currentTurn) {
      // 잡을 수 있는 위치 — 붉은 테두리
      ctx.beginPath();
      ctx.arc(x, y, 26, 0, Math.PI*2);
      ctx.fillStyle   = 'rgba(220,50,50,0.25)';
      ctx.strokeStyle = 'rgba(220,50,50,0.85)';
      ctx.lineWidth   = 2.5;
      ctx.fill();
      ctx.stroke();
    } else {
      // 빈 칸 — 초록 점
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI*2);
      ctx.fillStyle   = 'rgba(60,200,100,0.70)';
      ctx.strokeStyle = 'rgba(20,120,60,0.80)';
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();
    }
  }
}

const PIECE_RADII = { king:27, advisor:22, chariot:25, cannon:23, horse:24, elephant:24, pawn:19 };

function drawPieces() {
  for (let r=0; r<ROWS; r++) {
    for (let c=0; c<COLS; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const x  = MARGIN + c*SPACING;
      const y  = MARGIN + r*SPACING;
      const rd = PIECE_RADII[piece.type] || 22;
      const isGreen = piece.side === 'G';
      const isRed   = piece.side === 'R';
      const isSel   = selected && selected.r===r && selected.c===c;
      const inCheck = gameStarted && piece.type==='king' && isInCheck(piece.side, board);

      // 그림자
      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetY = 3;

      // 말 배경 (육각형 느낌)
      ctx.beginPath();
      ctx.arc(x, y, rd, 0, Math.PI*2);

      // 배경 그라디언트
      const grad = ctx.createRadialGradient(x-rd*0.3, y-rd*0.3, rd*0.1, x, y, rd);
      grad.addColorStop(0, '#fff8e8');
      grad.addColorStop(1, '#e8d4a8');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // 테두리
      ctx.beginPath();
      ctx.arc(x, y, rd, 0, Math.PI*2);
      if (isSel) {
        ctx.strokeStyle = '#f0d000';
        ctx.lineWidth   = 4;
      } else if (inCheck) {
        ctx.strokeStyle = '#ff2020';
        ctx.lineWidth   = 4;
      } else {
        ctx.strokeStyle = isGreen ? '#14532d' : '#7f1d1d';
        ctx.lineWidth   = 2.5;
      }
      ctx.stroke();

      // 내부 얇은 원
      ctx.beginPath();
      ctx.arc(x, y, rd-4, 0, Math.PI*2);
      ctx.strokeStyle = isGreen ? 'rgba(20,83,45,0.3)' : 'rgba(127,29,29,0.3)';
      ctx.lineWidth   = 1;
      ctx.stroke();

      // 선택 글로우
      if (isSel) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, rd+4, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(240,208,0,0.5)';
        ctx.lineWidth   = 6;
        ctx.stroke();
        ctx.restore();
      }

      // 장군 글로우
      if (inCheck) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, rd+5, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,30,30,0.45)';
        ctx.lineWidth   = 8;
        ctx.stroke();
        ctx.restore();
      }

      // 글자
      ctx.fillStyle    = isGreen ? '#14532d' : '#7f1d1d';
      ctx.font         = `bold ${Math.floor(rd*0.85)}px "Noto Serif KR", serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(piece.name, x, y+1);
    }
  }
}

// ── 초기화 ─────────────────────────────────────
initBoard();
updateSetupBtnUI();
draw();
