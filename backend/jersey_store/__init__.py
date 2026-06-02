import platform

if platform.system() == 'Windows':
    import pymysql
    pymysql.install_as_MySQLdb()
