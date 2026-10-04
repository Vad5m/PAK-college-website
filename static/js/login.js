(function () {
    const form = document.getElementById("adminAuthForm");
    const errorDiv = document.getElementById("errorMsg");
    const passwordInput = document.getElementById("adminPassword");
    const toggleBtn = document.getElementById("togglePassword");

    let isPasswordVisible = false;

    toggleBtn.addEventListener("click", function () {
        if (isPasswordVisible) {
            passwordInput.type = "password";
            toggleBtn.textContent = "👁️";
            isPasswordVisible = false;
        } else {
            passwordInput.type = "text";
            toggleBtn.textContent = "🙈";
            isPasswordVisible = true;
        }
    });

    function showError(text) {
        errorDiv.textContent = text;
        errorDiv.style.display = "block";
        setTimeout(() => {
            if (errorDiv.style.display === "block") {
                errorDiv.style.opacity = "0";
                setTimeout(() => {
                    errorDiv.style.display = "none";
                    errorDiv.style.opacity = "";
                }, 200);
            }
        }, 2800);
    }

    form.addEventListener("submit", function (e) {
        e.preventDefault();
        errorDiv.style.display = "none";

        const login = document.getElementById("adminLogin").value.trim();
        const password = document.getElementById("adminPassword").value.trim();

        fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                username: login,
                password: password,
            }),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.success) {
                    window.location.href = "/admin";
                } else {
                    showError(data.message || "Неверный логин или пароль");
                }
            })
            .catch(() => {
                showError("Ошибка соединения");
            });
    });

    document.getElementById("adminLogin").focus();
})();
