export function uploadEvidence(form: FormData, progress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/evidence");
    request.timeout = 120000;
    request.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(Error("Connection lost. Your issue is saved; retry the attachment."));
    request.ontimeout = () => reject(Error("Upload timed out. Retry the attachment."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { progress(100); resolve(); }
      else { let message = "Attachment could not be uploaded.";
        try { message = JSON.parse(request.responseText).error || message; } catch {}
        reject(Error(message)); }
    };
    progress(0); request.send(form);
  });
}
