Pod::Spec.new do |s|
  s.name           = 'MemorialEverFaceDetection'
  s.version        = '1.0.0'
  s.summary        = 'On-device face bounding-box detection extracted from Hatirasina.'
  s.description    = 'A deliberately small Expo module that exposes still-image face geometry only.'
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.author         = { 'Hatirasina' => 'support@hatirasina.com' }
  s.homepage       = 'https://github.com/Hatirasinamezarqr/memorial-qr-toolkit'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => 'https://github.com/Hatirasinamezarqr/memorial-qr-toolkit.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/FaceDetection', '8.0.0'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
