from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import datetime
import os
import requests # Groq API 통신용 추가

app = Flask(__name__)
# 모든 도메인에서 요청할 수 있도록 CORS 허용 (나중에 실제 도메인만 허용하도록 변경 권장)
CORS(app) 

# 🔐 환경 변수에서 키 읽어오기
CREDENTIAL_FILE = os.environ.get('FIREBASE_KEY_PATH', 'bloodborne-b1aae-firebase-adminsdk-fbsvc-aeb1b24d69.json')
# 서버 환경변수에 GROQ_API_KEY를 등록해서 쓸 겁니다. 로컬 테스트용이라면 아래에 문자열로 임시 입력하세요.

# 1. Firebase 초기화
try:
    cred = credentials.Certificate(CREDENTIAL_FILE)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("✅ Firebase 연동 성공!")
except Exception as e:
    print(f"❌ Firebase 연동 실패: {e}")

# 2. 퀴즈 생성 API (Groq API를 안전한 서버에서 호출)
@app.route('/generate_quiz', methods=['POST'])
def generate_quiz():
    try:
        # 프론트엔드에서 어떤 퀴즈를 원하는지 데이터를 받을 수 있습니다.
        client_data = request.json
        
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 프론트엔드에 있던 Groq API 호출 방식을 그대로 가져옵니다. 
        # (사용하시는 모델명과 프롬프트에 맞게 수정 가능)
        payload = {
            "model": "mixtral-8x7b-32768", 
            "messages": [
                {"role": "system", "content": "You are a helpful math quiz generator."},
                {"role": "user", "content": client_data.get("prompt", "Generate a random math problem.")}
            ]
        }
        
        # Groq 서버로 요청 전송
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        response.raise_for_status() # 에러 발생 시 예외 처리
        
        return jsonify(response.json()), 200

    except Exception as e:
        print(f"❌ Groq API 에러: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# 3. 게임 결과 저장 API (기존 유지)
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
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    print("🚀 백엔드 서버가 실행되었습니다. (http://localhost:5000)")
    app.run(port=5000)
