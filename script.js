/* =============================================
   장기 (Korean Chess) — script.js
   버전: Minimax AI (Alpha-Beta Pruning)
   - 플레이어 진영 선택 (초/한)
   - AI 난이도 3단계 (깊이 1/3/5)
   - 완전한 장기 규칙 구현
   ============================================= */


const canvas = document.getElementById('janggiBoard');
const ctx    = canvas.getContext('2d');


const SPACING = 60;
const MARGIN  = 30;
const COLS    = 9;
const ROWS    = 10;


// ── 상태 ──────────────────────────────────────
let board         = [];
let selected      = null;
let possibleMoves = [];
let currentTurn   = 'G';
let gameStarted   = false;
let passCount     = 0;
let capturedG     = [];
let capturedR     = [];
let layoutG       = 'default';
let layoutR       = 'default';


// AI 설정
let playerSide  = 'G';   // 플레이어 진영
let aiSide      = 'R';   // AI 진영
let aiDepth     = 3;     // 탐색 깊이
let aiThinking  = false; // AI 생각 중 플래그


// ── 기물 점수표 ─────────────────────────────────
const PIECE_SCORE = { chariot:13, cannon:7, horse:5, elephant:3, advisor:3, pawn:2, king:0 };


// AI 평가 점수 (Minimax용, 더 세밀하게)
const EVAL_WEIGHTS = {
  king:9999, chariot:130, cannon:70, horse:50, elephant:30, advisor:30, pawn:20
};


// ── 궁성 ──────────────────────────────────────
function isInPalace(r, c) {
  return (r >= 0 && r <= 2 && c >= 3 && c <= 5) ||
         (r >= 7 && r <= 9 && c >= 3 && c <= 5);
}


const PALACE_DIAG_LINES = [
  [[0,3],[1,4],[2,5]], [[0,5],[1,4],[2,3]],
  [[7,3],[8,4],[9,5]], [[7,5],[8,4],[9,3]],
];


function isOnPalaceDiag(r, c) {
  for (const line of PALACE_DIAG_LINES)
    for (const [lr, lc] of line)
      if (lr===r && lc===c) return true;
  return false;
}


function arePalaceDiagAdjacent(r1, c1, r2, c2) {
  if (!isOnPalaceDiag(r1,c1) || !isOnPalaceDiag(r2,c2)) return false;
  const samePalace = (r1<=2 && r2<=2) || (r1>=7 && r2>=7);
  if (!samePalace) return false;
  return Math.abs(r1-r2)===1 && Math.abs(c1-c2)===1;
}


// ── 보드 초기화 ────────────────────────────────
function createEmptyBoard() {
  return Array.from({length: ROWS}, () => Array(COLS).fill(null));
}


function getHorsElephPos(layout) {
  if (layout === 'inner')  return ['horse','elephant','horse','elephant'];
  if (layout === 'outer')  return ['elephant','horse','elephant','horse'];
  return                          ['horse','elephant','elephant','horse'];
}


function initBoard() {
  board = createEmptyBoard();
  const [g1,g2,g6,g7] = getHorsElephPos(layoutG);
  const [r1,r2,r6,r7] = getHorsElephPos(layoutR);
  const HN = { horse:'馬', elephant:'象' };


  board[1][4]=mk('G','king','楚'); board[0][3]=mk('G','advisor','士'); board[0][5]=mk('G','advisor','士');
  board[0][0]=mk('G','chariot','車'); board[0][8]=mk('G','chariot','車');
  board[0][1]=mk('G',g1,HN[g1]); board[0][2]=mk('G',g2,HN[g2]);
  board[0][6]=mk('G',g6,HN[g6]); board[0][7]=mk('G',g7,HN[g7]);
  board[2][1]=mk('G','cannon','包'); board[2][7]=mk('G','cannon','包');
  board[3][0]=mk('G','pawn','卒'); board[3][2]=mk('G','pawn','卒'); board[3][4]=mk('G','pawn','卒');
  board[3][6]=mk('G','pawn','卒'); board[3][8]=mk('G','pawn','卒');


  board[8][4]=mk('R','king','漢'); board[9][3]=mk('R','advisor','士'); board[9][5]=mk('R','advisor','士');
  board[9][0]=mk('R','chariot','車'); board[9][8]=mk('R','chariot','車');
  board[9][1]=mk('R',r1,HN[r1]); board[9][2]=mk('R',r2,HN[r2]);
  board[9][6]=mk('R',r6,HN[r6]); board[9][7]=mk('R',r7,HN[r7]);
  board[7][1]=mk('R','cannon','包'); board[7][7]=mk('R','cannon','包');
  board[6][0]=mk('R','pawn','兵'); board[6][2]=mk('R','pawn','兵'); board[6][4]=mk('R','pawn','兵');
  board[6][6]=mk('R','pawn','兵'); board[6][8]=mk('R','pawn','兵');
}


function mk(side, type, name) { return { side, type, name }; }


// ── 이동 규칙 ──────────────────────────────────
function getPossibleMoves(piece, r, c, brd) {
  brd = brd || board;
  const moves = [];
  const { type, side } = piece;
  if (type==='king')     kingAdvisorMoves(r,c,side,brd,moves,true);
  else if (type==='advisor')  kingAdvisorMoves(r,c,side,brd,moves,false);
  else if (type==='chariot')  chariotMoves(r,c,side,brd,moves);
  else if (type==='cannon')   cannonMoves(r,c,side,brd,moves);
  else if (type==='horse')    horseMoves(r,c,side,brd,moves);
  else if (type==='elephant') elephantMoves(r,c,side,brd,moves);
  else if (type==='pawn')     pawnMoves(r,c,side,brd,moves);
  return moves;
}


function inBounds(r,c) { return r>=0 && r<ROWS && c>=0 && c<COLS; }
function canLand(nr,nc,side,brd) {
  return inBounds(nr,nc) && (!brd[nr][nc] || brd[nr][nc].side!==side);
}


function kingAdvisorMoves(r,c,side,brd,moves,isKing) {
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr=r+dr,nc=c+dc;
    if (isInPalace(nr,nc) && canLand(nr,nc,side,brd)) moves.push([nr,nc]);
  }
  for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    const nr=r+dr,nc=c+dc;
    if (isInPalace(nr,nc) && arePalaceDiagAdjacent(r,c,nr,nc) && canLand(nr,nc,side,brd))
      moves.push([nr,nc]);
  }
}


function chariotMoves(r,c,side,brd,moves) {
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    for (let i=1; i<Math.max(ROWS,COLS); i++) {
      const nr=r+dr*i,nc=c+dc*i;
      if (!inBounds(nr,nc)) break;
      if (brd[nr][nc]) { if (brd[nr][nc].side!==side) moves.push([nr,nc]); break; }
      moves.push([nr,nc]);
    }
  }
  if (isOnPalaceDiag(r,c)) {
    for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      for (let i=1; i<=2; i++) {
        const nr=r+dr*i,nc=c+dc*i;
        if (!inBounds(nr,nc)||!isInPalace(nr,nc)||!isOnPalaceDiag(nr,nc)) break;
        if (brd[nr][nc]) { if (brd[nr][nc].side!==side) moves.push([nr,nc]); break; }
        moves.push([nr,nc]);
      }
    }
  }
}


function cannonMoves(r,c,side,brd,moves) {
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let jumped=false;
    for (let i=1; i<Math.max(ROWS,COLS); i++) {
      const nr=r+dr*i,nc=c+dc*i;
      if (!inBounds(nr,nc)) break;
      if (brd[nr][nc]) {
        if (!jumped) { if (brd[nr][nc].type==='cannon') break; jumped=true; }
        else { if (brd[nr][nc].type==='cannon') break; if (brd[nr][nc].side!==side) moves.push([nr,nc]); break; }
      } else { if (jumped) moves.push([nr,nc]); }
    }
  }
  if (isOnPalaceDiag(r,c)) {
    for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let jumped=false;
      for (let i=1; i<=2; i++) {
        const nr=r+dr*i,nc=c+dc*i;
        if (!inBounds(nr,nc)||!isInPalace(nr,nc)||!isOnPalaceDiag(nr,nc)) break;
        if (brd[nr][nc]) {
          if (!jumped) { if (brd[nr][nc].type==='cannon') break; jumped=true; }
          else { if (brd[nr][nc].type==='cannon') break; if (brd[nr][nc].side!==side) moves.push([nr,nc]); break; }
        } else { if (jumped) moves.push([nr,nc]); }
      }
    }
  }
}


function horseMoves(r,c,side,brd,moves) {
  const paths=[
    [[-1,0],[-2,-1]],[[-1,0],[-2,1]],[[1,0],[2,-1]],[[1,0],[2,1]],
    [[0,-1],[-1,-2]],[[0,-1],[1,-2]],[[0,1],[-1,2]],[[0,1],[1,2]],
  ];
  for (const [[mr,mc],[nr,nc]] of paths) {
    const er=r+mr,ec=c+mc,fr=r+nr,fc=c+nc;
    if (!inBounds(er,ec)) continue;
    if (brd[er][ec]) continue;
    if (inBounds(fr,fc) && canLand(fr,fc,side,brd)) moves.push([fr,fc]);
  }
}


function elephantMoves(r,c,side,brd,moves) {
  const paths=[
    [[-1,0],[-2,-1],[-3,-2]],[[-1,0],[-2,1],[-3,2]],
    [[1,0],[2,-1],[3,-2]],[[1,0],[2,1],[3,2]],
    [[0,-1],[-1,-2],[-2,-3]],[[0,-1],[1,-2],[2,-3]],
    [[0,1],[-1,2],[-2,3]],[[0,1],[1,2],[2,3]],
  ];
  for (const [d1,d2,[dr,dc]] of paths) {
    const b1r=r+d1[0],b1c=c+d1[1],b2r=r+d2[0],b2c=c+d2[1],nr=r+dr,nc=c+dc;
    if (!inBounds(b1r,b1c)||!inBounds(b2r,b2c)) continue;
    if (brd[b1r][b1c]||brd[b2r][b2c]) continue;
    if (inBounds(nr,nc) && canLand(nr,nc,side,brd)) moves.push([nr,nc]);
  }
}


function pawnMoves(r,c,side,brd,moves) {
  const forward=side==='G'?1:-1;
  const deltas=[[forward,0],[0,-1],[0,1]];
  if (isOnPalaceDiag(r,c)) deltas.push([forward,-1],[forward,1]);
  for (const [dr,dc] of deltas) {
    const nr=r+dr,nc=c+dc;
    if (!inBounds(nr,nc)) continue;
    if (Math.abs(dr)===1&&Math.abs(dc)===1) {
      if (!isInPalace(r,c)||!arePalaceDiagAdjacent(r,c,nr,nc)) continue;
    }
    if (canLand(nr,nc,side,brd)) moves.push([nr,nc]);
  }
}


// ── 체크/장군 ──────────────────────────────────
function isInCheck(side, brd) {
  let kr=-1,kc=-1;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++)
    if (brd[r][c]&&brd[r][c].side===side&&brd[r][c].type==='king') { kr=r;kc=c; }
  if (kr===-1) return false;
  const enemy=side==='G'?'R':'G';
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const p=brd[r][c];
    if (!p||p.side!==enemy) continue;
    if (getPossibleMoves(p,r,c,brd).some(([mr,mc])=>mr===kr&&mc===kc)) return true;
  }
  return false;
}


function moveResultsInSelfCheck(fr,fc,tr,tc,side) {
  const nb=cloneBoard(board);
  nb[tr][tc]=nb[fr][fc]; nb[fr][fc]=null;
  return isInCheck(side,nb);
}


function cloneBoard(brd) {
  return brd.map(row=>row.map(cell=>cell?{...cell}:null));
}


function getLegalMoves(piece,r,c) {
  return getPossibleMoves(piece,r,c,board)
    .filter(([tr,tc])=>!moveResultsInSelfCheck(r,c,tr,tc,piece.side));
}


function isCheckmate(side) {
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const p=board[r][c];
    if (!p||p.side!==side) continue;
    if (getLegalMoves(p,r,c).length>0) return false;
  }
  return true;
}


function isBikjang() {
  let gkr=-1,gkc=-1,rkr=-1,rkc=-1;
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const p=board[r][c];
    if (!p) continue;
    if (p.side==='G'&&p.type==='king'){gkr=r;gkc=c;}
    if (p.side==='R'&&p.type==='king'){rkr=r;rkc=c;}
  }
  if (gkc!==rkc) return false;
  const minR=Math.min(gkr,rkr),maxR=Math.max(gkr,rkr);
  for (let r=minR+1;r<maxR;r++) if (board[r][gkc]) return false;
  return true;
}


function calcScore(side) {
  let s=0;
  const captured=side==='G'?capturedG:capturedR;
  for (const p of captured) s+=PIECE_SCORE[p.type]||0;
  return s;
}


// ══════════════════════════════════════════════
//  AI — Minimax + Alpha-Beta Pruning
// ══════════════════════════════════════════════


// 보드 평가: 양수 = R(한) 유리, 음수 = G(초) 유리
function evaluateBoard(brd) {
  let score = 0;


  // 기물 가치 합산
  for (let r=0; r<ROWS; r++) {
    for (let c=0; c<COLS; c++) {
      const p = brd[r][c];
      if (!p) continue;
      const val = EVAL_WEIGHTS[p.type] || 0;
      // 위치 보너스: 포/차는 중앙 열 선호
      let posBonus = 0;
      if (p.type==='pawn') {
        // 졸/병: 상대방 진영에 있을수록 가치 높음
        posBonus = p.side==='G' ? r*0.5 : (9-r)*0.5;
      }
      score += p.side==='R' ? (val+posBonus) : -(val+posBonus);
    }
  }


  // 장군 상태 패널티
  if (isInCheck('G', brd)) score += 80;
  if (isInCheck('R', brd)) score -= 80;


  return score;
}


function getAllMovesBrd(side, brd) {
  const moves = [];
  for (let r=0; r<ROWS; r++) {
    for (let c=0; c<COLS; c++) {
      const p = brd[r][c];
      if (!p||p.side!==side) continue;
      const raw = getPossibleMoves(p,r,c,brd);
      for (const [tr,tc] of raw) {
        const nb = applyMoveBrd(brd,r,c,tr,tc);
        if (!isInCheck(side,nb)) moves.push({fr:r,fc:c,tr,tc});
      }
    }
  }
  return moves;
}


function applyMoveBrd(brd,fr,fc,tr,tc) {
  const nb = brd.map(row=>row.map(cell=>cell?{...cell}:null));
  nb[tr][tc]=nb[fr][fc]; nb[fr][fc]=null;
  return nb;
}


// 이동 정렬: 포획 이동을 앞으로 (Move Ordering → 가지치기 효율 향상)
function sortMoves(moves, brd) {
  return moves.sort((a,b) => {
    const va = brd[a.tr][a.tc] ? (EVAL_WEIGHTS[brd[a.tr][a.tc].type]||0) : 0;
    const vb = brd[b.tr][b.tc] ? (EVAL_WEIGHTS[brd[b.tr][b.tc].type]||0) : 0;
    return vb - va;
  });
}


function minimax(depth, alpha, beta, isMaximizing, brd) {
  if (depth === 0) return evaluateBoard(brd);


  const side = isMaximizing ? 'R' : 'G';
  const moves = sortMoves(getAllMovesBrd(side,brd), brd);


  if (moves.length === 0) {
    // 이동 불가 = 외통수
    return isMaximizing ? -99999 : 99999;
  }


  if (isMaximizing) {
    let best = -Infinity;
    for (const {fr,fc,tr,tc} of moves) {
      const nb = applyMoveBrd(brd,fr,fc,tr,tc);
      const val = minimax(depth-1, alpha, beta, false, nb);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break; // 가지치기
    }
    return best;
  } else {
    let best = Infinity;
    for (const {fr,fc,tr,tc} of moves) {
      const nb = applyMoveBrd(brd,fr,fc,tr,tc);
      const val = minimax(depth-1, alpha, beta, true, nb);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}


function getBestMove() {
  const isMax = aiSide === 'R'; // R(한)이 AI면 최대화
  const allMoves = sortMoves(getAllMovesBrd(aiSide, board), board);
  if (allMoves.length === 0) return null;


  let bestMove = null;
  let bestVal  = isMax ? -Infinity : Infinity;


  for (const move of allMoves) {
    const nb  = applyMoveBrd(board, move.fr, move.fc, move.tr, move.tc);
    const val = minimax(aiDepth-1, -Infinity, Infinity, !isMax, nb);
    if (isMax ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = move;
    }
  }
  return bestMove;
}


// Worker 없이 setTimeout으로 UI 블로킹 방지 (간단 버전)
function doAIMove() {
  if (!gameStarted || currentTurn !== aiSide || aiThinking) return;
  aiThinking = true;
  showThinkOverlay(true);


  setTimeout(() => {
    const move = getBestMove();
    showThinkOverlay(false);
    aiThinking = false;


    if (!move) { passTurn(); return; }


    const { fr, fc, tr, tc } = move;
    const captured = board[tr][tc];
    if (captured) {
      if (aiSide==='G') capturedG.push(captured);
      else              capturedR.push(captured);
    }
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = null;
    passCount = 0;


    updateCapturedUI();
    updateScoreUI();
    currentTurn = currentTurn==='G' ? 'R' : 'G';
    updateTurnUI();
    draw();
    setTimeout(checkGameState, 50);
  }, 30); // 30ms 후 실행 (UI 업데이트 먼저 렌더링)
}


function showThinkOverlay(show) {
  document.getElementById('think-overlay').style.display = show ? 'flex' : 'none';
}


// ── 게임 흐름 ──────────────────────────────────
function startGame() {
  gameStarted  = true;
  currentTurn  = 'G';
  passCount    = 0;
  capturedG    = [];
  capturedR    = [];
  selected     = null;
  possibleMoves= [];
  aiThinking   = false;


  initBoard();
  updateCapturedUI();
  updateScoreUI();
  updateTurnUI();
  updatePlayerLabels();


  document.getElementById('pass-btn').disabled  = false;
  document.getElementById('start-btn').disabled = true;
  disableSetupBtns(true);
  disablePreBtns(true);
  draw();


  // AI가 초(선공)이면 바로 이동
  if (currentTurn === aiSide) {
    setTimeout(doAIMove, 500);
  }
}


function resetGame() {
  gameStarted   = false;
  currentTurn   = 'G';
  passCount     = 0;
  capturedG     = [];
  capturedR     = [];
  selected      = null;
  possibleMoves = [];
  layoutG       = 'default';
  layoutR       = 'default';
  aiThinking    = false;


  document.getElementById('modal').style.display  = 'none';
  document.getElementById('pass-btn').disabled    = true;
  document.getElementById('start-btn').disabled   = false;
  showThinkOverlay(false);
  disableSetupBtns(false);
  disablePreBtns(false);
  updateSetupBtnUI();
  updateCapturedUI();
  updateScoreUI();
  updatePlayerLabels();


  const dot = document.getElementById('turn-dot');
  dot.className = 'turn-dot green-dot';
  document.getElementById('turn-text').textContent = '초(楚) 선공 · 차림을 선택하세요';


  initBoard();
  draw();
}


function passTurn() {
  if (!gameStarted || aiThinking) return;
  passCount++;
  if (passCount >= 2) { showModal('무승부','두 플레이어 모두 한수쉬어 무승부입니다.'); return; }
  currentTurn   = currentTurn==='G' ? 'R' : 'G';
  selected      = null;
  possibleMoves = [];
  updateTurnUI();
  draw();
  if (currentTurn === aiSide) setTimeout(doAIMove, 300);
}


function checkGameState() {
  if (isCheckmate(currentTurn)) {
    const winner = currentTurn==='G' ? '한(漢)' : '초(楚)';
    const loser  = currentTurn==='G' ? '초(楚)' : '한(漢)';
    const isPlayerWin = winner === (playerSide==='G' ? '초(楚)' : '한(漢)');
    showModal('외통수!', `${loser}의 왕이 포위됐습니다.\n${winner} 승리! ${isPlayerWin?'🎉 플레이어 승!':'🤖 AI 승!'}`);
    gameStarted = false;
    return;
  }
  if (isBikjang()) {
    const scores = { G: calcScore('G'), R: calcScore('R')+1.5 };
    const leader = scores.G>scores.R ? '초(楚)' : scores.R>scores.G ? '한(漢)' : '없음';
    showModal('빅장 (무승부)', `두 왕이 마주보고 있습니다.\n점수: 초 ${scores.G} | 한 ${scores.R.toFixed(1)}\n${leader!=='없음'?leader+' 점수 우세':'동점'}`);
    gameStarted = false;
    return;
  }
}


// ── 사이드/난이도 선택 ─────────────────────────
function setPlayerSide(side) {
  if (gameStarted) return;
  playerSide = side;
  aiSide     = side==='G' ? 'R' : 'G';
  document.getElementById('play-as-G').classList.toggle('active', side==='G');
  document.getElementById('play-as-R').classList.toggle('active', side==='R');
  updatePlayerLabels();
}


function setDifficulty(depth) {
  if (gameStarted) return;
  aiDepth = depth;
  [1,3,5].forEach(d => {
    document.getElementById(`diff-${d}`).classList.toggle('active', d===depth);
  });
}


function updatePlayerLabels() {
  const labelG = document.getElementById('label-G');
  const labelR = document.getElementById('label-R');
  if (playerSide === 'G') {
    labelG.innerHTML = '초 (楚) <span class="ai-badge">나</span>';
    labelR.innerHTML = '한 (漢) <span class="ai-badge">AI</span>';
  } else {
    labelG.innerHTML = '초 (楚) <span class="ai-badge">AI</span>';
    labelR.innerHTML = '한 (漢) <span class="ai-badge">나</span>';
  }
}


function disablePreBtns(disabled) {
  document.querySelectorAll('.pre-btn').forEach(b => b.disabled = disabled);
}


// ── 차림 ──────────────────────────────────────
function setLayout(side, layout) {
  if (gameStarted) return;
  if (side==='G') layoutG=layout; else layoutR=layout;
  updateSetupBtnUI();
  initBoard();
  draw();
}


function updateSetupBtnUI() {
  ['default','inner','outer'].forEach(l => {
    const id = l==='default'?'default':l==='inner'?'inner':'outer';
    document.getElementById(`g-${id}`).classList.toggle('active', layoutG===l);
    document.getElementById(`r-${id}`).classList.toggle('active', layoutR===l);
  });
}


function disableSetupBtns(disabled) {
  document.querySelectorAll('.setup-btn').forEach(b => b.disabled=disabled);
}


// ── UI 업데이트 ─────────────────────────────────
function updateTurnUI() {
  const dot  = document.getElementById('turn-dot');
  const text = document.getElementById('turn-text');
  const inCheck = isInCheck(currentTurn, board);
  const inBik   = isBikjang();
  const isAI    = currentTurn === aiSide;


  if (currentTurn==='G') {
    dot.className = 'turn-dot green-dot pulse';
    text.textContent = `초(楚) 차례${isAI?' [AI]':''}${inCheck?' ⚠ 장군!':''}${inBik?' ◈ 빅장':''}`;
  } else {
    dot.className = 'turn-dot red-dot pulse';
    text.textContent = `한(漢) 차례${isAI?' [AI]':''}${inCheck?' ⚠ 장군!':''}${inBik?' ◈ 빅장':''}`;
  }
}


function updateCapturedUI() {
  document.getElementById('captured-pieces-G').innerHTML =
    capturedG.map(p=>`<span class="cap-piece red">${p.name}</span>`).join('');
  document.getElementById('captured-pieces-R').innerHTML =
    capturedR.map(p=>`<span class="cap-piece green">${p.name}</span>`).join('');
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
  if (!gameStarted || currentTurn === aiSide || aiThinking) return;


  const rect  = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top)  * scaleY;


  const c = Math.round((mx - MARGIN) / SPACING);
  const r = Math.round((my - MARGIN) / SPACING);
  if (!inBounds(r,c)) return;


  if (selected) {
    const isPossible = possibleMoves.some(([pr,pc])=>pr===r&&pc===c);
    if (isPossible) {
      const moving   = board[selected.r][selected.c];
      const captured = board[r][c];
      if (captured) {
        if (moving.side==='G') capturedG.push(captured);
        else                   capturedR.push(captured);
      }
      board[r][c]                   = moving;
      board[selected.r][selected.c] = null;
      selected      = null;
      possibleMoves = [];
      passCount     = 0;


      updateCapturedUI();
      updateScoreUI();
      currentTurn = currentTurn==='G' ? 'R' : 'G';
      updateTurnUI();
      draw();


      setTimeout(() => {
        checkGameState();
        if (gameStarted && currentTurn===aiSide) setTimeout(doAIMove, 200);
      }, 50);
    } else {
      if (board[r][c] && board[r][c].side===currentTurn) {
        selected      = {r,c};
        possibleMoves = getLegalMoves(board[r][c],r,c);
      } else {
        selected=null; possibleMoves=[];
      }
      draw();
    }
  } else {
    if (board[r][c] && board[r][c].side===currentTurn) {
      selected      = {r,c};
      possibleMoves = getLegalMoves(board[r][c],r,c);
    }
    draw();
  }
});


// ── 그리기 ─────────────────────────────────────
const BOARD_BG_COLOR  = '#d4a96a';
const LINE_COLOR      = '#7a4e2a';
const PALACE_LINE_CLR = '#5a3010';


function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = BOARD_BG_COLOR;
  ctx.fillRect(0,0,canvas.width,canvas.height);


  ctx.save(); ctx.globalAlpha=0.05;
  for (let i=0;i<canvas.height;i+=3) {
    ctx.fillStyle=i%6===0?'#3d1a00':'#f0c070';
    ctx.fillRect(0,i,canvas.width,1);
  }
  ctx.restore();


  drawGrid();
  drawPalaceDiagonals();
  drawRiver();
  drawMoveHighlights();
  drawPieces();
}


function drawGrid() {
  ctx.strokeStyle=LINE_COLOR; ctx.lineWidth=1.5;
  for (let i=0;i<ROWS;i++) {
    ctx.beginPath(); ctx.moveTo(MARGIN,MARGIN+i*SPACING);
    ctx.lineTo(MARGIN+(COLS-1)*SPACING,MARGIN+i*SPACING); ctx.stroke();
  }
  for (let j=0;j<COLS;j++) {
    ctx.beginPath(); ctx.moveTo(MARGIN+j*SPACING,MARGIN);
    ctx.lineTo(MARGIN+j*SPACING,MARGIN+(ROWS-1)*SPACING); ctx.stroke();
  }
  ctx.strokeStyle='#5a3010'; ctx.lineWidth=3;
  ctx.strokeRect(MARGIN,MARGIN,(COLS-1)*SPACING,(ROWS-1)*SPACING);
}


function drawPalaceDiagonals() {
  ctx.strokeStyle=PALACE_LINE_CLR; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
  ctx.beginPath();
  ctx.moveTo(MARGIN+3*SPACING,MARGIN+0*SPACING); ctx.lineTo(MARGIN+5*SPACING,MARGIN+2*SPACING);
  ctx.moveTo(MARGIN+5*SPACING,MARGIN+0*SPACING); ctx.lineTo(MARGIN+3*SPACING,MARGIN+2*SPACING);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MARGIN+3*SPACING,MARGIN+7*SPACING); ctx.lineTo(MARGIN+5*SPACING,MARGIN+9*SPACING);
  ctx.moveTo(MARGIN+5*SPACING,MARGIN+7*SPACING); ctx.lineTo(MARGIN+3*SPACING,MARGIN+9*SPACING);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='rgba(200,147,74,0.3)';
  ctx.fillRect(MARGIN+3*SPACING-1,MARGIN,2*SPACING+2,2*SPACING);
  ctx.fillRect(MARGIN+3*SPACING-1,MARGIN+7*SPACING,2*SPACING+2,2*SPACING);
}


function drawRiver() {
  const ry=MARGIN+4.5*SPACING;
  ctx.save();
  ctx.fillStyle='rgba(100,160,220,0.12)';
  ctx.fillRect(MARGIN,MARGIN+4*SPACING,(COLS-1)*SPACING,SPACING);
  ctx.font='italic bold 13px "Noto Serif KR",serif';
  ctx.fillStyle='rgba(80,120,180,0.45)'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('楚 河',MARGIN+2*SPACING,ry);
  ctx.fillText('漢 界',MARGIN+6*SPACING,ry);
  ctx.restore();
}


function drawMoveHighlights() {
  for (const [r,c] of possibleMoves) {
    const x=MARGIN+c*SPACING, y=MARGIN+r*SPACING;
    const target=board[r][c];
    if (target&&target.side!==currentTurn) {
      ctx.beginPath(); ctx.arc(x,y,26,0,Math.PI*2);
      ctx.fillStyle='rgba(220,50,50,0.25)'; ctx.strokeStyle='rgba(220,50,50,0.85)';
      ctx.lineWidth=2.5; ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2);
      ctx.fillStyle='rgba(60,200,100,0.70)'; ctx.strokeStyle='rgba(20,120,60,0.80)';
      ctx.lineWidth=2; ctx.fill(); ctx.stroke();
    }
  }
}


const PIECE_RADII={king:27,advisor:22,chariot:25,cannon:23,horse:24,elephant:24,pawn:19};


function drawPieces() {
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
    const piece=board[r][c]; if (!piece) continue;
    const x=MARGIN+c*SPACING, y=MARGIN+r*SPACING;
    const rd=PIECE_RADII[piece.type]||22;
    const isGreen=piece.side==='G';
    const isSel=selected&&selected.r===r&&selected.c===c;
    const inCheck=gameStarted&&piece.type==='king'&&isInCheck(piece.side,board);
    const isAIPiece=piece.side===aiSide;


    ctx.save(); ctx.shadowColor='rgba(0,0,0,0.4)'; ctx.shadowBlur=6; ctx.shadowOffsetY=3;
    ctx.beginPath(); ctx.arc(x,y,rd,0,Math.PI*2);
    const grad=ctx.createRadialGradient(x-rd*0.3,y-rd*0.3,rd*0.1,x,y,rd);
    grad.addColorStop(0,'#fff8e8'); grad.addColorStop(1,'#e8d4a8');
    ctx.fillStyle=grad; ctx.fill(); ctx.restore();


    ctx.beginPath(); ctx.arc(x,y,rd,0,Math.PI*2);
    if (isSel)       { ctx.strokeStyle='#f0d000'; ctx.lineWidth=4; }
    else if (inCheck){ ctx.strokeStyle='#ff2020'; ctx.lineWidth=4; }
    else             { ctx.strokeStyle=isGreen?'#14532d':'#7f1d1d'; ctx.lineWidth=2.5; }
    ctx.stroke();


    ctx.beginPath(); ctx.arc(x,y,rd-4,0,Math.PI*2);
    ctx.strokeStyle=isGreen?'rgba(20,83,45,0.3)':'rgba(127,29,29,0.3)';
    ctx.lineWidth=1; ctx.stroke();


    if (isSel) {
      ctx.save(); ctx.beginPath(); ctx.arc(x,y,rd+4,0,Math.PI*2);
      ctx.strokeStyle='rgba(240,208,0,0.5)'; ctx.lineWidth=6; ctx.stroke(); ctx.restore();
    }
    if (inCheck) {
      ctx.save(); ctx.beginPath(); ctx.arc(x,y,rd+5,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,30,30,0.45)'; ctx.lineWidth=8; ctx.stroke(); ctx.restore();
    }


    ctx.fillStyle=isGreen?'#14532d':'#7f1d1d';
    ctx.font=`bold ${Math.floor(rd*0.85)}px "Noto Serif KR",serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(piece.name,x,y+1);
  }
}


// ── 초기화 ─────────────────────────────────────
initBoard();
updateSetupBtnUI();
updatePlayerLabels();
draw();

