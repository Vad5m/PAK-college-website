document.addEventListener('DOMContentLoaded', function () {
    var mapContainer = document.getElementById('yandex-map-container');
    if (!mapContainer) return;

    var iframe = mapContainer.querySelector('iframe');
    if (!iframe) return;

    iframe.style.width = '100%';
    iframe.style.height = '100%';
});
