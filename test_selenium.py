from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

options = Options()
options.add_argument('--headless')
driver = webdriver.Chrome(options=options)
driver.get("http://localhost:8000")
time.sleep(3) # Wait for fetch
for entry in driver.get_log('browser'):
    print(entry)
print("BODY:", driver.find_element("tag name", "body").text[:500])
driver.quit()
