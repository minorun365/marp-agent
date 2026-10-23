import type { CustomMessageTriggerHandler } from 'aws-lambda';

// Cognito の既定の英語の文面を、日本語に差し替える。
// コードは Cognito が codeParameter（{####}）の位置へ埋め込むので、ここでは文面だけを決める。
export const handler: CustomMessageTriggerHandler = async (event) => {
  const code = event.request.codeParameter;
  switch (event.triggerSource) {
    case 'CustomMessage_SignUp':
    case 'CustomMessage_ResendCode':
      event.response.emailSubject = 'パワポ作るマンの確認コード';
      event.response.emailMessage = `パワポ作るマンの登録を完了するための確認コードは ${code} です。`;
      break;
    case 'CustomMessage_Authentication':
      event.response.emailSubject = 'パワポ作るマンのログインコード';
      event.response.emailMessage = `パワポ作るマンにログインするためのコードは ${code} です。心当たりがない場合は、このメールを破棄してください。`;
      break;
    default:
      break;
  }
  return event;
};
