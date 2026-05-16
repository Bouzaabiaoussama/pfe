from ultralytics import YOLO
import argparse
from pathlib import Path
import cv2
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fire/Smoke detection on a single image")
    parser.add_argument("image", help="Path to the image file")
    parser.add_argument(
        "--model",
        default=str(Path(__file__).resolve().parent / "weights" / "best.pt"),
        help="Path to the YOLOv8 .pt model",
    )
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")
    parser.add_argument("--no-show", action="store_true", help="Do not open a window")
    parser.add_argument("--save-dir", default="detections", help="Output directory")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    image_path = Path(args.image).expanduser().resolve()
    model_path = Path(args.model).expanduser().resolve()

    if not image_path.exists():
        print(f"Image not found: {image_path}")
        sys.exit(1)

    if not model_path.exists():
        print(f"Model not found: {model_path}")
        sys.exit(1)

    image = cv2.imread(str(image_path))
    if image is None:
        print("Failed to read image.")
        sys.exit(1)

    model = YOLO(str(model_path))
    results = model.predict(source=image, conf=args.conf, verbose=False)

    annotated = results[0].plot()
    boxes = results[0].boxes

    print(f"Detections: {len(boxes)}")
    for idx, box in enumerate(boxes):
        class_id = int(box.cls[0])
        class_name = model.names[class_id]
        confidence = float(box.conf[0])
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        print(
            f"{idx + 1}. {class_name.upper()} conf={confidence:.2f} "
            f"box=({int(x1)},{int(y1)})-({int(x2)},{int(y2)})"
        )

    save_dir = Path(args.save_dir).expanduser().resolve()
    save_dir.mkdir(parents=True, exist_ok=True)
    out_path = save_dir / f"result_{image_path.stem}.jpg"
    cv2.imwrite(str(out_path), annotated)
    print(f"Saved: {out_path}")

    if not args.no_show:
        cv2.imshow("Fire/Smoke Detection", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
