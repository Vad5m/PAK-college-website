(function() {
    const currentPath = window.location.pathname;
    const allTabs = document.querySelectorAll(".tabs-row .tab-link");
    if (allTabs.length) {
        let hasActive = false;
        for (let tab of allTabs) {
            const href = tab.getAttribute("href");
            if (href && (currentPath === href || (currentPath === "/" && href === "/home"))) {
                tab.classList.add("active");
                hasActive = true;
                break;
            }
            if (href && currentPath.startsWith(href) && href !== "/") {
                tab.classList.add("active");
                hasActive = true;
                break;
            }
        }
        if (!hasActive && !document.querySelector(".tabs-row .active")) {
            const homeLink = document.querySelector('.tabs-row a[href="/home"]');
            if (homeLink) homeLink.classList.add("active");
        }
    }

    const menuList = document.getElementById("mobileMenuList");

    function buildMobileMenu() {
        if (!menuList) return;
        const originalLinks = document.querySelectorAll(".tabs-row .tab-link");
        if (!originalLinks.length) return;
        menuList.innerHTML = "";
        originalLinks.forEach((link) => {
            const clone = link.cloneNode(true);
            clone.style.cssText = "";
            menuList.appendChild(clone);
        });
        const mobileLinks = menuList.querySelectorAll(".tab-link");
        originalLinks.forEach((orig, idx) => {
            if (mobileLinks[idx]) {
                if (orig.classList.contains("active"))
                    mobileLinks[idx].classList.add("active");
                else mobileLinks[idx].classList.remove("active");
            }
        });
    }

    const blueTopBar = document.getElementById("blueTopBar");
    const contentArea = document.getElementById("contentArea");
    const menuContainer = document.getElementById("mobileMenuContainer");
    const burgerBtn = document.getElementById("burgerMenuBtn");
    let isMobileMenuOpen = false;

    function updateMenuPosition() {
        if (!blueTopBar) return;
        const headerHeight = blueTopBar.offsetHeight;
        document.documentElement.style.setProperty("--mobile-menu-top", headerHeight + "px");
        if (menuContainer)
            menuContainer.style.setProperty("--mobile-menu-top", headerHeight + "px");
    }

    function openMobileMenu() {
        if (!menuContainer) return;
        updateMenuPosition();
        menuContainer.classList.add("active");
        isMobileMenuOpen = true;
        if (burgerBtn && window.innerWidth <= 768)
            burgerBtn.classList.add("active-burger");
    }

    function closeMobileMenu() {
        if (!menuContainer) return;
        menuContainer.classList.remove("active");
        isMobileMenuOpen = false;
        if (burgerBtn) burgerBtn.classList.remove("active-burger");
    }

    function toggleMobileMenu(e) {
        if (window.innerWidth > 768) return;
        e.stopPropagation();
        if (isMobileMenuOpen) closeMobileMenu();
        else openMobileMenu();
    }

    if (menuList) {
        menuList.addEventListener("click", (e) => {
            if (e.target.closest(".tab-link")) closeMobileMenu();
        });
    }

    document.addEventListener("click", function(e) {
        if (window.innerWidth > 768) return;
        if (isMobileMenuOpen) {
            const isClickOnBurger = burgerBtn && burgerBtn.contains(e.target);
            const isClickInMenu = menuContainer && menuContainer.contains(e.target);
            if (!isClickOnBurger && !isClickInMenu) closeMobileMenu();
        }
    });

    if (burgerBtn) burgerBtn.addEventListener("click", toggleMobileMenu);

    window.addEventListener("resize", () => {
        if (window.innerWidth > 768 && isMobileMenuOpen) closeMobileMenu();
        updateMenuPosition();
        updateContentMargin();
    });

    window.addEventListener("scroll", () => {
        updateMenuPosition();
        handleScrollCompact();
    });

    let scrollThreshold = 20;
    let isCompactMode = false;

    function handleScrollCompact() {
        const scrollY = window.scrollY || window.pageYOffset;
        const shouldBeCompact = scrollY > scrollThreshold;
        if (shouldBeCompact && !isCompactMode) {
            blueTopBar.classList.add("is-compact");
            isCompactMode = true;
            if (isMobileMenuOpen) updateMenuPosition();
        } else if (!shouldBeCompact && isCompactMode) {
            blueTopBar.classList.remove("is-compact");
            isCompactMode = false;
            if (isMobileMenuOpen) updateMenuPosition();
        }
    }

    function updateContentMargin() {
        if (contentArea && blueTopBar) {
            const headerHeight = blueTopBar.offsetHeight;
            contentArea.style.marginTop = headerHeight + 18 + "px";
        }
    }

    window.addEventListener("load", function() {
        buildMobileMenu();
        updateMenuPosition();
        updateContentMargin();
        if (window.scrollY > scrollThreshold && !isCompactMode) {
            blueTopBar.classList.add("is-compact");
            isCompactMode = true;
        } else if (window.scrollY <= scrollThreshold && isCompactMode) {
            blueTopBar.classList.remove("is-compact");
            isCompactMode = false;
        }
    });

    const logoImg = document.getElementById("mainLogo");
    if (logoImg) {
        logoImg.addEventListener("error", function() {
            this.onerror = null;
            this.src = "https://placehold.co/400x200?text=PAK";
        });
    }

    const themeToggle = document.getElementById("themeToggle");
    const mobileThemeToggle = document.getElementById("mobileThemeToggle");
    const body = document.body;

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
        body.classList.add("dark-theme");
        if (themeToggle) themeToggle.checked = true;
    }

    function toggleTheme(checked) {
        if (checked) {
            body.classList.add("dark-theme");
            localStorage.setItem("theme", "dark");
        } else {
            body.classList.remove("dark-theme");
            localStorage.setItem("theme", "light");
        }
        if (themeToggle) themeToggle.checked = checked;
    }

    if (themeToggle) {
        themeToggle.addEventListener("change", function() {
            toggleTheme(this.checked);
        });
    }

    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener("click", function() {
            const isDark = body.classList.contains("dark-theme");
            toggleTheme(!isDark);
        });
    }

    const asciiArt = `
                                                       %=.. .-*%
                                                     %-         *
                                                    %.     =% .=*#
                                                    -         ====#
                                                   %:    .:=++*====#
                                                   =.   ..=    @=-#%
                                                   .=    .=   %+::-#@
                                                    *.   .:* %*----=+@
                                                     +    .:#=-=+++=-*
                                                      .    .=-:::::::*
                                                       #    *::::::::+
                           @==*%                 @@@@@  =  =+:======:=%
                           @-    =--==*+++==:.           .=:::::---::::=%
                            *:   =:.                     :+-:::::::::::-%
                            =::   .#+         .       .         :==*==%
                            #:..   =:..          :.:.            .-=#
                             %-..    +-:..            ......     .:+%
                              %+..     =-:..........:=#:.-:     ..-#
                              %=....      .=+++++++::+:=-.     .:.*
                                =.:...                       ..::+#
                                 *:::.:.                   ....:#@
                                   *-:=:.          ..  .:.::::-@
                                      ##.         .+..::.:.:*
                                        #.       :*:.:--#%%
                                         %-....:*-...:+@
                                           ###@    *+#
                                           #+*@    #+*
                                           %**@    *+*
                                           #+=@    #==@
                                           %+=#     +=**#*%
                                           *=====+% *=====*#
                                          *==+===*  #% #*++#
                                         @#
            `;
    console.log(asciiArt);
})();
