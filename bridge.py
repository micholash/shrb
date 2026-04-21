from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import requests

app = Flask(__name__)
CORS(app) 

# 환경 변수에서 키 읽기 (하드코딩된 API 키 완전 삭제!)
CREDENTIAL_FILE = os.environ.get('FIREBASE_KEY_PATH', 'bloodborne-b1aae-firebase-adminsdk-fbsvc-aeb1b24d69.json')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')

# 서버 시작 시 API 키가 있는지 확인
if not GROQ_API_KEY:
    print("🚨 경고: GROQ_API_KEY가 환경 변수에 설정되지 않았습니다!")

# 1. Firebase 초기화
try:
    cred = credentials.Certificate(CREDENTIAL_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase 연동 성공!")
except Exception as e:
    print(f"❌ Firebase 연동 실패: {e}")

# 2. 퀴즈 생성 엔드포인트 (Groq 통신 대행)
@app.route('/generate_quiz', methods=['POST'])
def generate_quiz():
    try:
        data = request.json
        target_lang = data.get("targetLang", "Korean (한국어)")
        
        prompt = f"너는 수능 수학 출제 위원이야. 미적분/기하/확통 중 하나를 골라 수능 28번 난이도의 객관식 문제를 1개 만들어.\n[필수 규칙]\n1. 문제는 억지스럽지 않고 논리적으로 완전히 완벽해야 해.\n2. 수식을 제외한 **모든 문제 지문과 보기 텍스트는 반드시 {target_lang}로 작성**해야 해!\n3. 무조건 아래 JSON 형식만 반환해:\n{{ \"question\": \"문제 텍스트\", \"options\": [\"1번\", \"2번\", \"3번\", \"4번\", \"5번\"], \"answer\": \"정답번호(1~5)\" }}"

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2 
        }
        
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status() 
        
        return jsonify(response.json()), 200

    except Exception as e:
        print(f"❌ Groq API 에러: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# 3. 통계 저장 엔드포인트
@app.route('/save_stats', methods=['POST'])
def save_stats():
    try:
        data = request.json
        doc_data = {
            "clearTime": data.get("clearTime"),
            "totalAttempted": data.get("totalAttempted"),
            "correctAnswers": data.get("correctAnswers"),
            "wrongQuestions": data.get("wrongQuestions"),
            "timestamp": datetime.datetime.now()
        }
        db.collection('game_clears').add(doc_data)
        print(f"📊 게임 결과 저장 완료: {data.get('clearTime')}초 클리어")
        return jsonify({"status": "success", "message": "Firebase 저장 완료"}), 200
    except Exception as e:
        print(f"❌ 에러 발생: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    print("🚀 백엔드 서버가 실행되었습니다. (http://localhost:5000)")
    app.run(port=5000)
