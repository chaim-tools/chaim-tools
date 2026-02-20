dependencies {
  implementation("com.fasterxml.jackson.core:jackson-databind:2.17.2")
  
  testImplementation("org.junit.jupiter:junit-jupiter:5.10.3")
  testImplementation("org.assertj:assertj-core:3.26.3")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.3")
}

tasks.test {
  useJUnitPlatform()
}
