dependencies {
  implementation(project(":schema-core"))
  implementation("com.squareup:javapoet:1.13.0")
  implementation("software.amazon.awssdk:dynamodb:2.21.29")
  implementation("software.amazon.awssdk:dynamodb-enhanced:2.21.29")
  implementation("com.fasterxml.jackson.core:jackson-databind:2.15.2")
  
  testImplementation("org.junit.jupiter:junit-jupiter:5.10.3")
  testImplementation("org.assertj:assertj-core:3.26.3")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.3")
}

tasks.test {
  useJUnitPlatform()
}

// Create an executable fat JAR with all dependencies
tasks.jar {
  manifest {
    attributes["Main-Class"] = "co.chaim.generators.java.Main"
  }
  // Include all dependencies in the JAR
  from(configurations.runtimeClasspath.get().map { if (it.isDirectory) it else zipTree(it) })
  duplicatesStrategy = DuplicatesStrategy.EXCLUDE
}
