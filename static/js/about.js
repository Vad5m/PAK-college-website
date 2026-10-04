(function () {
    const video = document.querySelector(".video-wrapper video");
    if (video) {
        video.setAttribute("preload", "metadata");

        if ("IntersectionObserver" in window) {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            if (video.preload === "metadata") {
                                video.preload = "auto";
                            }
                            observer.unobserve(video);
                        }
                    });
                },
                { threshold: 0.1 },
            );
            observer.observe(video);
        } else {
            video.preload = "auto";
        }
    }
})();
