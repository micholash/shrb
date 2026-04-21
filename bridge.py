import os
import requests
import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore

# 1. 환경 변수 로드 (로컬 .env 파일 읽기용)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
CORS(app)

# 2. 정보 설정 (GitHub Secret 또는 .env에서 가져옴)
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
# 파일 경로는 기본적으로 현재 폴더의 json 파일을 바라보게 설정
CREDENTIAL_FILE = os.environ.get('FIREBASE_KEY_PATH', 'bloodborne-b1aae-firebase-adminsdk-fbsvc-aeb1b24d69.json')

# 3. Firebase 초기화
try:
    if os.path.exists(CREDENTIAL_FILE):
        cred = credentials.Certificate(CREDENTIAL_FILE)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✅ Firebase 연동 성공!")
    else:
        print(f"❌ 키 파일을 찾을 수 없습니다: {CREDENTIAL_FILE}")
except Exception as e:
    print(f"❌ Firebase 초기화 에러: {e}")

# 4. AI 퀴즈 생성 로직
@app.route('/generate_quiz', methods=['POST'])
def generate_quiz():
    if not GROQ_API_KEY:
        return jsonify({"status": "error", "message": "API 키가 설정되지 않았습니다."}), 500

    data = request.json
    target_lang = data.get("targetLang", "Korean (한국어)")

    prompt = (
        f"너는 수학 선생님이야. 수능 난이도의 객관식 수학 문제를 만들어줘.\n"
        f"언어: {target_lang}\n"
        f"형식: JSON만 반환해. {{'question': '', 'options': ['', '', '', '', ''], 'answer': '1~5'}}"
    )

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            }
        )
        return jsonify(response.json()), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# 5. 게임 결과 저장
@app.route('/save_stats', methods=['POST'])
def save_stats():
    try:
        data = request.json
        data['timestamp'] = datetime.datetime.now()
        db.collection('game_clears').add(data)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    print("🚀 서버 실행 중: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000)
