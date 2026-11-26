import ExpoModulesCore
import MLKitFaceDetection
import MLKitVision
import UIKit

public final class MemorialEverFaceDetectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MemorialEverFaceDetection")

    AsyncFunction("detectFaces") { (imageUri: String) async throws -> [[String: Double]] in
      guard let url = URL(string: imageUri), url.isFileURL,
            let image = UIImage(contentsOfFile: url.path) else {
        throw FaceDetectionException("The image must be a readable local file URI.")
      }

      let orientedSize = image.imageOrientation.isQuarterTurn
        ? CGSize(width: image.size.height * image.scale, height: image.size.width * image.scale)
        : CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
      let options = FaceDetectorOptions()
      options.performanceMode = .accurate
      options.landmarkMode = .none
      options.contourMode = .none
      options.classificationMode = .none
      options.minFaceSize = 0.05
      options.isTrackingEnabled = false
      let detector = FaceDetector.faceDetector(options: options)
      let visionImage = VisionImage(image: image)
      visionImage.orientation = image.imageOrientation
      let faces = try detector.results(in: visionImage)

      return faces.map { face in
        [
          "x": face.frame.origin.x,
          "y": face.frame.origin.y,
          "width": face.frame.size.width,
          "height": face.frame.size.height,
          "imageWidth": orientedSize.width,
          "imageHeight": orientedSize.height,
        ]
      }
    }
  }
}

private final class FaceDetectionException: GenericException<String> {
  override var reason: String { param }
}

private extension UIImage.Orientation {
  var isQuarterTurn: Bool {
    self == .left || self == .leftMirrored || self == .right || self == .rightMirrored
  }
}
