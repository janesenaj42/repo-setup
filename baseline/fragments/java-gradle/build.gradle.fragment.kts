// The root CLAUDE.md "Code review standards" rules a linter can check, plus formatting.
// Merge into the project's build.gradle.kts.

plugins {
    checkstyle
    id("com.diffplug.spotless") version "8.10.3"
}

spotless {
    java {
        // The version Spotless ships with: a newer google-java-format can fail inside Spotless
        // (InvocationTargetException on every file, seen with 8.10.3 and 1.37.0 on JDK 21).
        googleJavaFormat()
        removeUnusedImports()
    }
}

checkstyle {
    toolVersion = "14.3.0"
    // Main code only: tests describe cases with literal values and long methods.
    sourceSets = listOf(project.sourceSets.main.get())
    maxWarnings = 0
}
