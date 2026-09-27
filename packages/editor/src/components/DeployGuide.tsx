import uploadShot from '../assets/cloudflare-upload.webp';

// ZIP 내보내기 화면의 "학생에게 나눠 주는 방법" 안내. 자세한 내용은 저장소 docs/zip-guide.md, ZIP 안 README.txt와 같다.
export function DeployGuide({ open }: { open: boolean }) {
  return (
    <details open={open} className="border rounded-lg bg-gray-50 text-sm text-gray-700">
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-800">📘 받은 ZIP으로 학생에게 나눠 주는 방법</summary>
      <div className="px-4 pb-4 flex flex-col gap-3 leading-relaxed">
        <p className="bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2">
          ZIP이나 그 안의 index.html을 <b>더블클릭하면 동작하지 않습니다.</b> 아래처럼 Cloudflare(무료)에 올려서 주소로 여세요.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li><a className="text-blue-700 underline" href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">dash.cloudflare.com</a>에 가입·로그인합니다 (신용카드 불필요).</li>
          <li>
            계정 홈의 <b>Ship something new</b> 칸(아래 그림 ①, “Drop a folder, or a zip”)에 <b>받은 ZIP 파일을 그대로 끌어다 놓고</b> 안내에 따라 배포합니다.
            <img src={uploadShot} alt="Cloudflare 계정 홈: 가운데 Ship something new 칸에 ZIP을 끌어다 놓는다" className="mt-2 rounded border w-full" />
          </li>
          <li>배포가 끝나면 <code>https://무작위이름.내계정.workers.dev</code> 같은 <b>주소가 생깁니다. 그 주소를 그대로 학생에게 주세요.</b> 첫 화면이 실습으로 자동 이동합니다.</li>
          <li>칠판·클래스룸에 주소를 올리거나 QR 코드를 띄웁니다 (크롬 주소창 공유 아이콘 → QR 코드 만들기).</li>
        </ol>
        <div>
          <h4 className="font-semibold text-gray-800">고쳤을 때</h4>
          <p>다시 ZIP 내보내기 → 같은 칸(①)에 새 ZIP을 올리면 새 주소가 생깁니다. 올린 사이트 목록·삭제는 왼쪽 <b>컴퓨트</b> 메뉴(②)에 있습니다.</p>
        </div>
        <div>
          <h4 className="font-semibold text-gray-800">수업 전날 확인</h4>
          <p>시크릿 창으로 끝까지 해 보고, 학생이 쓸 실제 기기와 학교 와이파이에서도 열어 보세요. 학생은 안내·연습·평가 모드를 고르며, 결과는 학생 화면에만 보이고 저장·전송되지 않습니다.</p>
        </div>
        <p className="text-xs text-gray-500">
          이 주소는 링크만 알면 누구나 볼 수 있습니다. 가상 자료만 올리세요. Cloudflare 화면은 자주 바뀌니 그림과 다르면 계정 홈에서 “Drop a folder, or a zip” 또는 “Create app”을 찾으세요.
        </p>
      </div>
    </details>
  );
}
