// Recorte/zoom de foto de perfil usando Cropper.js (cargado en index.html).
// El crop box queda fijo en el centro (redondo via CSS en MenuTest.razor) y
// el usuario mueve/hace zoom a la imagen por debajo, como cualquier selector
// de avatar tipo WhatsApp/Slack.
window.avatarCrop = window.avatarCrop || {};

(function () {
    let cropper = null;
    let initialRatio = 1;

    window.avatarCrop.init = function (imgId) {
        window.avatarCrop.destroy();

        const img = document.getElementById(imgId);
        if (!img || typeof Cropper === 'undefined') return;

        cropper = new Cropper(img, {
            aspectRatio: 1,
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            background: false,
            responsive: true,
            guides: false,
            center: false,
            highlight: false,
            cropBoxMovable: false,
            cropBoxResizable: false,
            toggleDragModeOnDblclick: false,
            ready: function () {
                // Ratio con el que Cropper ajusta la imagen al marco por defecto;
                // el slider de zoom se calcula siempre relativo a este valor.
                const data = cropper.getImageData();
                initialRatio = data.naturalWidth > 0 ? data.width / data.naturalWidth : 1;
            }
        });
    };

    // value: 0 = ajuste inicial (llena el marco), hasta 3 = zoom extra x4.
    window.avatarCrop.setZoom = function (value) {
        if (!cropper) return;
        const factor = parseFloat(value) || 0;
        cropper.zoomTo(initialRatio * (1 + factor));
    };

    window.avatarCrop.getCroppedImage = function () {
        if (!cropper) return null;
        const canvas = cropper.getCroppedCanvas({ width: 400, height: 400, imageSmoothingQuality: 'high' });
        return canvas ? canvas.toDataURL('image/jpeg', 0.9) : null;
    };

    window.avatarCrop.destroy = function () {
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        initialRatio = 1;
    };
})();
