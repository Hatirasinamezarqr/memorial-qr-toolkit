package com.memorialever.facedetection

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MemorialEverFaceDetectionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MemorialEverFaceDetection")

    AsyncFunction("detectFaces") { imageUri: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("ERR_FACE_DETECTION_CONTEXT", "React context is unavailable.", null)
        return@AsyncFunction
      }

      try {
        val image = InputImage.fromFilePath(context, Uri.parse(imageUri))
        val options = FaceDetectorOptions.Builder()
          .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
          .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
          .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
          .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
          .setMinFaceSize(0.05f)
          .build()
        val detector = FaceDetection.getClient(options)
        detector.process(image)
          .addOnSuccessListener { faces ->
            promise.resolve(faces.map { face ->
              mapOf(
                "x" to face.boundingBox.left.toDouble(),
                "y" to face.boundingBox.top.toDouble(),
                "width" to face.boundingBox.width().toDouble(),
                "height" to face.boundingBox.height().toDouble(),
                "imageWidth" to image.width.toDouble(),
                "imageHeight" to image.height.toDouble(),
              )
            })
            detector.close()
          }
          .addOnFailureListener { error ->
            detector.close()
            promise.reject("ERR_FACE_DETECTION_RUNTIME", error.message, error)
          }
      } catch (error: Exception) {
        promise.reject("ERR_FACE_DETECTION_INPUT", error.message, error)
      }
    }
  }
}
