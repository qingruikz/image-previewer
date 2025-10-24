// main.ts
import { App, Plugin, Modal, setIcon } from "obsidian";

// ======================================================
// 1. Plugin Entry Point
// ======================================================
export default class ImageToolkitPlugin extends Plugin {
	async onload() {
		this.registerDomEvent(
			document,
			"click",
			(evt: MouseEvent) => {
				const target = evt.target as HTMLElement;
				if (
					target.tagName === "IMG" &&
					target.closest(".workspace-leaf-content")
				) {
					evt.preventDefault();
					evt.stopPropagation();
					const src = target.getAttribute("src");
					if (src) {
						new ImagePreviewModal(this.app, src).open();
					}
				}
			},
			{ capture: true }
		);
	}
}

// ======================================================
// 2. The Modal
// ======================================================
class ImagePreviewModal extends Modal {
	private imgSrc: string;
	private container: HTMLDivElement;
	private imgElement: HTMLImageElement;
	private sliderElement: HTMLInputElement;
	private rotationValueElement: HTMLSpanElement;

	private currentRotation = 0;
	private currentScale = 1;
	private scaleX = 1;
	private scaleY = 1;
	private isGrayscale = false;
	private translateX = 0;
	private translateY = 0;

	private isPanning = false;
	private startPanX = 0;
	private startPanY = 0;
	private startTranslateX = 0;
	private startTranslateY = 0;

	private isPinching = false;
	private initialDistance = 0;
	private initialAngle = 0;
	private pinchStartScale = 1;
	private pinchStartRotation = 0;

	constructor(app: App, imgSrc: string) {
		super(app);
		this.imgSrc = imgSrc;
		this.handleMouseDown = this.handleMouseDown.bind(this);
		this.handleMouseMove = this.handleMouseMove.bind(this);
		this.handleMouseUp = this.handleMouseUp.bind(this);
		this.handleTouchStart = this.handleTouchStart.bind(this);
		this.handleTouchMove = this.handleTouchMove.bind(this);
		this.handleTouchEnd = this.handleTouchEnd.bind(this);
		this.handleWheel = this.handleWheel.bind(this);
		this.handleBackgroundClick = this.handleBackgroundClick.bind(this);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass("image-toolkit-modal");
		contentEl.addClass("image-toolkit-modal-content");

		this.container = contentEl.createDiv({ cls: "image-container" });
		this.imgElement = this.container.createEl("img", {
			attr: { src: this.imgSrc },
		});
		this.imgElement.addClass("preview-image");
		this.imgElement.addClass("is-draggable");

		this.createControls(contentEl);
		this.createCloseButton(contentEl);
		this.addEventListeners();
		this.applyTransformations();
	}

	onClose() {
		this.removeEventListeners();
		this.contentEl.empty();
	}

	// --- UI ---
	private createControls(container: HTMLElement) {
		const controlsContainer = container.createDiv({
			cls: "controls-container",
		});

		const sliderContainer = controlsContainer.createDiv({
			cls: "rotation-slider-container",
		});
		this.sliderElement = sliderContainer.createEl("input", {
			type: "range",
			cls: "rotation-slider",
		});
		this.sliderElement.min = "0";
		this.sliderElement.max = "360";
		this.sliderElement.addEventListener("input", (e) => {
			const target = e.target as HTMLInputElement;
			this.currentRotation = parseInt(target.value, 10);
			this.applyTransformations();
		});
		this.rotationValueElement = sliderContainer.createEl("span", {
			cls: "rotation-value",
		});

		const toolbar = controlsContainer.createDiv({
			cls: "image-toolkit-toolbar",
		});
		this.createIconButton(toolbar, "zoom-in", "Zoom In", () => {
			this.currentScale += 0.1;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "zoom-out", "Zoom Out", () => {
			this.currentScale = Math.max(0.1, this.currentScale - 0.1);
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "rotate-cw", "Rotate Right 45°", () => {
			this.currentRotation += 45;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "rotate-ccw", "Rotate Left 45°", () => {
			this.currentRotation -= 45;
			this.applyTransformations();
		});
		this.createIconButton(
			toolbar,
			"flip-horizontal",
			"Flip Horizontal",
			() => {
				this.scaleX *= -1;
				this.applyTransformations();
			}
		);
		this.createIconButton(toolbar, "flip-vertical", "Flip Vertical", () => {
			this.scaleY *= -1;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "contrast", "Toggle Grayscale", () => {
			this.isGrayscale = !this.isGrayscale;
			this.applyTransformations();
		});
		this.createIconButton(toolbar, "refresh-cw", "Reset", () =>
			this.resetTransformations()
		);
	}

	private createCloseButton(container: HTMLElement) {
		const closeButton = container.createEl("button", {
			cls: "image-toolkit-close-button",
		});
		setIcon(closeButton, "x");
		closeButton.setAttribute("aria-label", "Close");
		closeButton.onClickEvent(() => {
			this.close();
		});
	}

	private addEventListeners() {
		this.container.addEventListener("mousedown", this.handleMouseDown);
		this.container.addEventListener("touchstart", this.handleTouchStart, {
			passive: false,
		});
		this.container.addEventListener("wheel", this.handleWheel);
		this.container.addEventListener("click", this.handleBackgroundClick);
	}

	private removeEventListeners() {
		this.container.removeEventListener("mousedown", this.handleMouseDown);
		this.container.removeEventListener("touchstart", this.handleTouchStart);
		this.container.removeEventListener("wheel", this.handleWheel);
		this.container.removeEventListener("click", this.handleBackgroundClick);
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
		document.removeEventListener("touchmove", this.handleTouchMove);
		document.removeEventListener("touchend", this.handleTouchEnd);
	}

	private handleMouseDown(e: MouseEvent) {
		if (e.button !== 0) return;
		e.preventDefault();

		this.isPanning = true;
		this.startPanX = e.clientX;
		this.startPanY = e.clientY;
		this.startTranslateX = this.translateX;
		this.startTranslateY = this.translateY;

		document.addEventListener("mousemove", this.handleMouseMove);
		document.addEventListener("mouseup", this.handleMouseUp);
		this.imgElement.addClass("is-panning");
	}

	private handleMouseMove(e: MouseEvent) {
		if (!this.isPanning) return;
		const deltaX = e.clientX - this.startPanX;
		const deltaY = e.clientY - this.startPanY;
		this.translateX = this.startTranslateX + deltaX;
		this.translateY = this.startTranslateY + deltaY;
		this.applyTransformations();
	}

	private handleMouseUp() {
		this.isPanning = false;
		document.removeEventListener("mousemove", this.handleMouseMove);
		document.removeEventListener("mouseup", this.handleMouseUp);
		this.imgElement.removeClass("is-panning");
	}

	private handleTouchStart(e: TouchEvent) {
		document.addEventListener("touchmove", this.handleTouchMove, {
			passive: false,
		});
		document.addEventListener("touchend", this.handleTouchEnd);

		if (e.touches.length === 1) {
			e.preventDefault();
			this.isPanning = true;
			this.startPanX = e.touches[0].clientX;
			this.startPanY = e.touches[0].clientY;
			this.startTranslateX = this.translateX;
			this.startTranslateY = this.translateY;
		} else if (e.touches.length === 2) {
			e.preventDefault();
			this.isPanning = false;
			this.isPinching = true;
			this.initialDistance = this.getDistance(e.touches);
			this.initialAngle = this.getAngle(e.touches);
			this.pinchStartScale = this.currentScale;
			this.pinchStartRotation = this.currentRotation;
		}
	}

	private handleTouchMove(e: TouchEvent) {
		if (this.isPanning && e.touches.length === 1) {
			e.preventDefault();
			const deltaX = e.touches[0].clientX - this.startPanX;
			const deltaY = e.touches[0].clientY - this.startPanY;
			this.translateX = this.startTranslateX + deltaX;
			this.translateY = this.startTranslateY + deltaY;
			this.applyTransformations();
		} else if (this.isPinching && e.touches.length === 2) {
			e.preventDefault();
			const currentDistance = this.getDistance(e.touches);
			this.currentScale =
				this.pinchStartScale * (currentDistance / this.initialDistance);
			const currentAngle = this.getAngle(e.touches);
			const angleDiff = currentAngle - this.initialAngle;
			this.currentRotation = this.pinchStartRotation + angleDiff;
			this.applyTransformations();
		}
	}

	private handleTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) this.isPinching = false;
		if (e.touches.length < 1) {
			this.isPanning = false;
			document.removeEventListener("touchmove", this.handleTouchMove);
			document.removeEventListener("touchend", this.handleTouchEnd);
		}
	}

	private handleBackgroundClick(e: MouseEvent) {
		if (e.target === this.container) {
			this.close();
		}
	}

	private handleWheel(e: WheelEvent) {
		e.preventDefault();
		const zoomFactor = 0.1;
		if (e.deltaY < 0) {
			this.currentScale += zoomFactor;
		} else {
			this.currentScale = Math.max(0.1, this.currentScale - zoomFactor);
		}
		this.applyTransformations();
	}

	private getDistance(touches: TouchList): number {
		const [touch1, touch2] = [touches[0], touches[1]];
		return Math.sqrt(
			Math.pow(touch1.pageX - touch2.pageX, 2) +
				Math.pow(touch1.pageY - touch2.pageY, 2)
		);
	}

	private getAngle(touches: TouchList): number {
		const [touch1, touch2] = [touches[0], touches[1]];
		const angleRad = Math.atan2(
			touch2.pageY - touch1.pageY,
			touch2.pageX - touch1.pageX
		);
		return angleRad * (180 / Math.PI);
	}

	private createIconButton(
		container: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void
	) {
		const button = container.createEl("button");
		setIcon(button, icon);
		button.setAttribute("aria-label", tooltip);
		button.onClickEvent(onClick);
	}

	private applyTransformations() {
		if (!this.imgElement) return;
		const transforms = [
			`translate(${this.translateX}px, ${this.translateY}px)`, // **新增：应用平移**
			`rotate(${this.currentRotation}deg)`,
			`scale(${this.currentScale})`,
			`scaleX(${this.scaleX})`,
			`scaleY(${this.scaleY})`,
		];
		this.imgElement.style.transform = transforms.join(" ");
		this.imgElement.style.filter = this.isGrayscale
			? "grayscale(100%)"
			: "none";

		const displayRotation = Math.round(
			((this.currentRotation % 360) + 360) % 360
		);
		if (this.sliderElement)
			this.sliderElement.value = String(displayRotation);
		if (this.rotationValueElement)
			this.rotationValueElement.textContent = `${displayRotation}°`;
	}

	private resetTransformations() {
		this.currentRotation = 0;
		this.currentScale = 1;
		this.scaleX = 1;
		this.scaleY = 1;
		this.isGrayscale = false;
		this.translateX = 0;
		this.translateY = 0;
		this.applyTransformations();
	}
}
