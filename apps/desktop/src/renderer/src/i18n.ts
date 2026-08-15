import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const ko = {
  translation: {
    "app.name": "Whalex",
    "onboarding.welcome.title": "Whalex에 오신 것을 환영합니다",
    "onboarding.welcome.subtitle":
      "DeepSeek 기반 코딩 에이전트 — 내 컴퓨터에서 코드를 읽고, 고치고, 실행합니다.",
    "onboarding.welcome.start": "시작하기",
    "onboarding.language": "언어",
    "onboarding.apiKey.title": "DeepSeek API 키 연결",
    "onboarding.apiKey.subtitle":
      "키는 이 컴퓨터에만 암호화되어 저장됩니다 (Windows DPAPI).",
    "onboarding.apiKey.placeholder": "sk-...",
    "onboarding.apiKey.get": "DeepSeek API 키 발급받기 →",
    "onboarding.apiKey.test": "연결 확인",
    "onboarding.apiKey.testing": "확인 중...",
    "onboarding.apiKey.success": "연결 성공 — 사용 가능한 모델 {{count}}개",
    "onboarding.apiKey.skip": "나중에 설정하기",
    "onboarding.folder.title": "작업 폴더 선택",
    "onboarding.folder.subtitle":
      "Whalex가 이 폴더의 파일을 읽고 수정할 수 있습니다. 모든 변경은 승인 후 실행됩니다.",
    "onboarding.folder.pick": "폴더 선택...",
    "onboarding.folder.finish": "Whalex 시작",
    "onboarding.next": "다음",
    "onboarding.back": "이전",
    "sidebar.newSession": "새 세션",
    "sidebar.sessions": "세션",
    "sidebar.changeFolder": "폴더 변경...",
    "sidebar.empty": "아직 세션이 없습니다",
    "composer.placeholder": "무엇을 만들까요? (Enter 전송, Shift+Enter 줄바꿈)",
    "composer.stop": "중지",
    "composer.send": "전송",
    "composer.model": "모델",
    "transcript.empty.title": "무엇이든 시켜보세요",
    "transcript.empty.subtitle":
      "예: \"이 폴더에 투두리스트 웹앱 만들어줘\", \"package.json 훑고 빌드 스크립트 설명해줘\"",
    "transcript.reasoning": "추론 과정",
    "transcript.interrupted": "중단됨",
    "tool.running": "실행 중...",
    "tool.showMore": "더 보기",
    "tool.showLess": "접기",
    "permission.title": "권한 요청",
    "permission.allowOnce": "한 번 허용",
    "permission.allowAlways": "항상 허용",
    "permission.deny": "거부",
    "status.thinking": "생각 중",
    "status.streaming": "응답 중",
    "status.tool": "도구 실행 중",
    "error.rate_limit": "요청 한도 초과 — 잠시 후 다시 시도하세요",
    "error.invalid_key": "API 키가 올바르지 않습니다",
    "error.insufficient_balance": "DeepSeek 잔액이 부족합니다",
    "error.network": "네트워크 오류",
    "error.context_overflow": "컨텍스트가 가득 찼습니다",
    "error.unknown": "오류가 발생했습니다",
    "statusbar.context": "컨텍스트",
    "statusbar.tokens": "토큰",
    "todos.title": "작업 목록",
  },
};

const en = {
  translation: {
    "app.name": "Whalex",
    "onboarding.welcome.title": "Welcome to Whalex",
    "onboarding.welcome.subtitle":
      "A DeepSeek-powered coding agent that reads, edits, and runs code on your machine.",
    "onboarding.welcome.start": "Get started",
    "onboarding.language": "Language",
    "onboarding.apiKey.title": "Connect your DeepSeek API key",
    "onboarding.apiKey.subtitle":
      "Your key is stored encrypted on this machine only (Windows DPAPI).",
    "onboarding.apiKey.placeholder": "sk-...",
    "onboarding.apiKey.get": "Get a DeepSeek API key →",
    "onboarding.apiKey.test": "Test connection",
    "onboarding.apiKey.testing": "Testing...",
    "onboarding.apiKey.success": "Connected — {{count}} models available",
    "onboarding.apiKey.skip": "Set up later",
    "onboarding.folder.title": "Choose a working folder",
    "onboarding.folder.subtitle":
      "Whalex can read and edit files in this folder. Every change runs only after your approval.",
    "onboarding.folder.pick": "Choose folder...",
    "onboarding.folder.finish": "Start Whalex",
    "onboarding.next": "Next",
    "onboarding.back": "Back",
    "sidebar.newSession": "New session",
    "sidebar.sessions": "Sessions",
    "sidebar.changeFolder": "Change folder...",
    "sidebar.empty": "No sessions yet",
    "composer.placeholder": "What should we build? (Enter to send, Shift+Enter for newline)",
    "composer.stop": "Stop",
    "composer.send": "Send",
    "composer.model": "Model",
    "transcript.empty.title": "Ask for anything",
    "transcript.empty.subtitle":
      'e.g. "Build a todo web app in this folder", "Read package.json and explain the build scripts"',
    "transcript.reasoning": "Reasoning",
    "transcript.interrupted": "Interrupted",
    "tool.running": "Running...",
    "tool.showMore": "Show more",
    "tool.showLess": "Show less",
    "permission.title": "Permission request",
    "permission.allowOnce": "Allow once",
    "permission.allowAlways": "Always allow",
    "permission.deny": "Deny",
    "status.thinking": "Thinking",
    "status.streaming": "Responding",
    "status.tool": "Running tools",
    "error.rate_limit": "Rate limited — try again shortly",
    "error.invalid_key": "Invalid API key",
    "error.insufficient_balance": "Insufficient DeepSeek balance",
    "error.network": "Network error",
    "error.context_overflow": "Context window is full",
    "error.unknown": "Something went wrong",
    "statusbar.context": "Context",
    "statusbar.tokens": "Tokens",
    "todos.title": "Todos",
  },
};

export function initI18n(language: "system" | "ko" | "en"): void {
  const resolved =
    language === "system"
      ? navigator.language.toLowerCase().startsWith("ko")
        ? "ko"
        : "en"
      : language;
  void i18n.use(initReactI18next).init({
    resources: { ko, en },
    lng: resolved,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

export function switchLanguage(language: "system" | "ko" | "en"): void {
  const resolved =
    language === "system"
      ? navigator.language.toLowerCase().startsWith("ko")
        ? "ko"
        : "en"
      : language;
  void i18n.changeLanguage(resolved);
}
