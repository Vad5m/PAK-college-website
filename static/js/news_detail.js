function shareNews(newsId, title) {
    const url = window.location.origin + "/news/" + newsId;
    if (navigator.share) {
        navigator
            .share({
                title: title || "Новость",
                url: url,
            })
            .catch(() => {});
    } else {
        navigator.clipboard
            .writeText(url)
            .then(() => {
                showToast("Ссылка скопирована!");
            })
            .catch(() => {
                const textarea = document.createElement("textarea");
                textarea.value = url;
                document.body.appendChild(textarea);
                textarea.select();
                try {
                    document.execCommand("copy");
                    showToast("Ссылка скопирована!");
                } catch (err) {
                    alert("Скопируйте ссылку: " + url);
                }
                document.body.removeChild(textarea);
            });
    }
}

function showToast(msg) {
    var toast = document.createElement("div");
    toast.style.cssText =
        "position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#0b3b5f;color:#fff;padding:12px 24px;border-radius:30px;font-size:0.9rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fadeInOut 2s ease forwards;";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2500);
}
