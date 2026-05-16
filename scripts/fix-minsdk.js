const fs = require('fs');
const path = require('path');

const files = [
  'android/build.gradle',
  'android/app/build.gradle',
];

files.forEach(filePath => {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    content = content.replace(/minSdkVersion\s*=?\s*24/g, 'minSdkVersion = 26');
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Fixed minSdkVersion in ${filePath}`);
  }
});