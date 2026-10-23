document.addEventListener('keydown', function(event) {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
    }

    if (event.key === 'ArrowLeft') {
        const prevLink = document.getElementById('prev-month');
        if (prevLink) {
            prevLink.click();
        }
    } else if (event.key === 'ArrowRight') {
        const nextLink = document.getElementById('next-month');
        if (nextLink) {
            nextLink.click();
        }
    }
});