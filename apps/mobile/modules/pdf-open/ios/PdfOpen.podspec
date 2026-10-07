Pod::Spec.new do |s|
  s.name           = 'PdfOpen'
  s.version        = '1.0.0'
  s.summary        = 'Opens a PDF in Quick Look'
  s.description    = 'Hands a PDF in the app cache to QLPreviewController and resolves when it closes.'
  s.author         = 'offload'
  s.homepage       = 'https://offload.club'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
