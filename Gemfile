source 'https://rubygems.org'

# You may use http://rbenv.org/ or https://rvm.io/ to install and use this version
ruby ">= 2.6.10"

# Exclude problematic versions of cocoapods and activesupport that causes build failures.
gem 'cocoapods', '~> 1.16.2'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'
gem 'concurrent-ruby', '< 1.3.4'

# Ruby 3.4.0 has removed some libraries from the standard library.
gem 'bigdecimal'
gem 'logger'
gem 'benchmark'
gem 'mutex_m'
gem 'erb'
gem 'ostruct'
gem 'abbrev'

gem 'fastlane', '2.229.1'
gem 'rexml', '3.3.9'

# Required by fastlane-common/Fastfile
gem 'notion-sdk-ruby'
gem 'rest-client'
gem 'aws-sdk-s3'
gem 'aws-sdk-dynamodb'
gem 'plist'


plugins_path = File.join(File.dirname(__FILE__), 'fastlane', 'Pluginfile')
eval_gemfile(plugins_path) if File.exist?(plugins_path)
